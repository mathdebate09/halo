import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, useReducedMotion } from 'react-native-reanimated';

import { CheckIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { db } from '@/db/client';
import { mealItems, meals, reports, vitalsReadings } from '@/db/schema';
import { patchMeal } from '@/meals/analysis';
import { emitMealLogged } from '@/meals/events';
import { ERROR_LINES } from '@/reports/report-card';
import { type ReportError, RETRYABLE, retryReport } from '@/reports/runner';
import { round } from '@/shared';

import { cardCorrection, cardWords, type StoredCard } from './act';
import { Thinking } from './reply';
import { ADVISOR_COLORS } from './theme';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** The pill that does a card's step. */
function ActButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      className="h-10 items-center justify-center rounded-pill bg-text px-4">
      <Text className="font-sans-medium text-[15px] text-bg">{label}</Text>
    </PressScale>
  );
}

/** A quiet text action beside a card's state (Undo, View, Fix, Retry). */
function QuietAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={10}
      className="ml-3 h-10 justify-center">
      <Text className="font-sans-medium text-[14px] text-accent">{label}</Text>
    </Pressable>
  );
}

/** Done: a check and the word, with the correction beside it. */
function DoneState({ word, children }: { word: string; children?: ReactNode }) {
  return (
    <Animated.View
      key={word}
      entering={FadeIn.duration(200).easing(EASE_OUT)}
      className="h-10 flex-row items-center pl-2">
      <CheckIcon size={18} color={ADVISOR_COLORS.muted} />
      <Text className="ml-1.5 font-sans text-[14px] text-muted">{word}</Text>
      {children}
    </Animated.View>
  );
}

/** One card in the chat: what it is, one line of numbers, and what can be done with it. */
function ChatCard({
  title,
  line,
  right,
  entering,
}: {
  title: string;
  line?: string | null;
  right?: ReactNode;
  entering?: ReturnType<typeof FadeIn.duration>;
}) {
  return (
    <Animated.View
      entering={entering}
      className="mt-4 flex-row items-center rounded-[22px] border border-hairline/10 bg-surface py-3.5 pl-5 pr-3">
      <View className="mr-3 flex-1">
        <Text className="font-sans-medium text-[16px] leading-[22px] text-text" numberOfLines={2}>
          {title}
        </Text>
        {line ? (
          <Text
            className="mt-0.5 font-sans text-[14px] leading-[20px] text-muted"
            numberOfLines={2}>
            {line}
          </Text>
        ) : null}
      </View>
      {right}
    </Animated.View>
  );
}

/**
 * A reply's prepared step: one button that does it. Once done the button gives way to a quiet
 * check, with its correction (Undo, or View for a meal) right there.
 */
export function AdvisorCardView({
  card,
  units,
  enterDelay,
  onAct,
  onCorrect,
}: {
  card: StoredCard;
  units: { pounds: boolean; clock24: boolean };
  /** A card that arrives with a streaming reply waits for its words; a stored one shows at once. */
  enterDelay: number | null;
  onAct: () => void;
  onCorrect: () => void;
}) {
  const reduced = useReducedMotion();
  const words = cardWords(card, units);
  const correction = cardCorrection(card);
  const entering =
    enterDelay == null
      ? undefined
      : FadeIn.delay(reduced ? 0 : enterDelay)
          .duration(300)
          .easing(EASE_OUT);
  return (
    <ChatCard
      title={words.title}
      line={words.line}
      entering={entering}
      right={
        card.done && words.done ? (
          <DoneState word={words.done}>
            {correction ? <QuietAction label={correction} onPress={onCorrect} /> : null}
          </DoneState>
        ) : (
          <ActButton label={words.button} onPress={onAct} />
        )
      }
    />
  );
}

const openMeal = (id: string) => router.push({ pathname: '/meal/[id]', params: { id } });

/**
 * A meal photo sent in the chat: read like any logged photo, then one Log tap; Fix opens the
 * meal's sheet. It follows the meal wherever it's changed (a fix there shows here).
 */
export function MealPhotoCard({ mealId }: { mealId: string }) {
  const { data: rows } = useLiveQuery(
    db
      .select()
      .from(meals)
      .where(and(eq(meals.id, mealId), isNull(meals.deletedAt))),
    [mealId],
  );
  const { data: items } = useLiveQuery(
    db
      .select()
      .from(mealItems)
      .where(and(eq(mealItems.mealId, mealId), isNull(mealItems.deletedAt)))
      .orderBy(asc(mealItems.createdAt)),
    [mealId],
  );
  const meal = rows[0];
  if (!meal) return <ChatCard title="Meal removed" />;
  if (meal.status === 'analysing') {
    return (
      <View className="mt-3">
        <Thinking label="Reading the photo" />
      </View>
    );
  }
  const kcal = round(
    items.reduce((t, i) => t + i.kcal, 0),
    0,
  );
  const protein = round(
    items.reduce((t, i) => t + i.proteinG, 0),
    0,
  );
  const line = items.length ? `${kcal} kcal · ${protein} g protein` : null;
  const title = meal.title ?? items[0]?.name ?? 'Meal';
  if (meal.status === 'logged') {
    return (
      <ChatCard
        title={title}
        line={line}
        right={
          <DoneState word="Logged">
            <QuietAction label="View" onPress={() => openMeal(meal.id)} />
          </DoneState>
        }
      />
    );
  }
  if (meal.status === 'failed' || items.length === 0) {
    return (
      <ChatCard
        title={meal.status === 'failed' ? 'Couldn’t read this one' : 'No food spotted'}
        right={<ActButton label="Add it" onPress={() => openMeal(meal.id)} />}
      />
    );
  }
  const log = () => {
    const sum = (key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG') =>
      round(
        items.reduce((t, i) => t + i[key], 0),
        1,
      );
    patchMeal(meal, {
      status: 'logged',
      title,
      kcal: sum('kcal'),
      proteinG: sum('proteinG'),
      carbsG: sum('carbsG'),
      fatG: sum('fatG'),
    });
    emitMealLogged();
  };
  return (
    <ChatCard
      title={title}
      line={line}
      entering={FadeIn.duration(300).easing(EASE_OUT)}
      right={
        <View className="flex-row items-center">
          <QuietAction label="Fix" onPress={() => openMeal(meal.id)} />
          <View className="ml-3">
            <ActButton label="Log" onPress={log} />
          </View>
        </View>
      }
    />
  );
}

/**
 * A lab report sent in the chat: its pages as they're read, then what it added to Vitals, or why it
 * couldn't be read (Retry when trying later can work).
 */
export function ReportChatCard({ reportId }: { reportId: string }) {
  const { data: rows } = useLiveQuery(
    db
      .select()
      .from(reports)
      .where(and(eq(reports.id, reportId), isNull(reports.deletedAt))),
    [reportId],
  );
  const { data: added } = useLiveQuery(
    db
      .select({ n: count() })
      .from(vitalsReadings)
      .where(and(eq(vitalsReadings.reportId, reportId), isNull(vitalsReadings.deletedAt))),
    [reportId],
  );
  const report = rows[0];
  // A report whose every value was already there is dropped by the runner.
  if (!report) return <ChatCard title="Already in Vitals" />;
  if (report.status === 'analysing') {
    const p = report.progress;
    const label =
      p && p.total > 1
        ? `Reading your report · page ${Math.min(p.done + 1, p.total)} of ${p.total}`
        : 'Reading your report';
    return (
      <View className="mt-3">
        <Thinking label={label} />
      </View>
    );
  }
  if (report.status === 'failed') {
    const error = (report.error ?? 'error') as ReportError;
    return (
      <ChatCard
        title="Couldn’t read this report"
        line={ERROR_LINES[error]}
        right={
          RETRYABLE.includes(error) ? (
            <ActButton label="Retry" onPress={() => retryReport(report.id)} />
          ) : null
        }
      />
    );
  }
  const n = added[0]?.n ?? 0;
  return (
    <ChatCard
      title="Lab report"
      line={`${n} value${n === 1 ? '' : 's'} in Vitals`}
      entering={FadeIn.duration(300).easing(EASE_OUT)}
      right={
        <DoneState word="Added">
          <QuietAction
            label="View"
            onPress={() => router.push({ pathname: '/report/[id]', params: { id: report.id } })}
          />
        </DoneState>
      }
    />
  );
}
