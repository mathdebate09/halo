import { and, eq, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, QuietButton } from '@/components/button';
import { DateWheels, type WheelDate, wheelDate, wheelKey } from '@/components/date-wheels';
import { CloseIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { Sheet } from '@/components/sheet';
import { ThemedScreen } from '@/components/themed-screen';
import { showToast } from '@/components/toast';
import { db } from '@/db/client';
import { reports, vitalsReadings } from '@/db/schema';
import { useProfile } from '@/lib/plan';
import { confirmReport, type KeptValue, removeReport } from '@/reports/confirm';
import { ReviewRow } from '@/reports/review-row';
import { dismissReport } from '@/reports/runner';
import { useHaloTheme } from '@/theme/theme-provider';
import {
  CHECK_CONFIDENCE,
  dayKey,
  dayStart,
  isAnalyteKey,
  type MergedReport,
  printedView,
  rangeFor,
  rangeWords,
  type ReportValue,
  type Sex,
  toCanonical,
} from '@/shared';

// The confirm step (SPEC §3: nothing from a report counts until the user checks it). Values are
// shown as printed, grouped by test date, the ones outside their range first. The user can untick
// a value, fix a number, or set the date when the report printed none; only then are they added.
// A report already added opens here too, read-only, with Remove.

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 16 }, (_, i) => THIS_YEAR - 15 + i);
const NO_DATE = '';

const dateLabel = (day: string) =>
  dayStart(day, 12).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
const count = (n: number) => `${n} value${n === 1 ? '' : 's'}`;

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useProfile();
  const { data } = useLiveQuery(
    db
      .select()
      .from(reports)
      .where(and(eq(reports.id, id), isNull(reports.deletedAt))),
    [id],
  );
  const report = data[0];
  const sex = profile?.sex ?? null;
  return (
    <ThemedScreen>
      {report?.status === 'review' ? (
        <Review id={id} merged={report.extracted as MergedReport} sex={sex} />
      ) : report?.status === 'confirmed' ? (
        <Added id={id} date={report.reportDate} sex={sex} />
      ) : null}
    </ThemedScreen>
  );
}

function Header({ title, line }: { title: string; line?: string }) {
  const insets = useSafeAreaInsets();
  const { theme } = useHaloTheme();
  return (
    <View className="px-5" style={{ paddingTop: insets.top + 8 }}>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={() => router.back()}
        hitSlop={10}
        className="-ml-2 h-11 w-11 items-center justify-center">
        <CloseIcon size={24} color={theme.colors.text} />
      </PressScale>
      <Text accessibilityRole="header" className="mt-2 font-serif text-[34px] text-text">
        {title}
      </Text>
      {line ? <Text className="mt-1 font-sans text-[15px] text-muted">{line}</Text> : null}
    </View>
  );
}

const outside = (state: string | null | undefined) =>
  state === 'above' || state === 'below' ? 0 : 1;

function Review({ id, merged, sex }: { id: string; merged: MergedReport; sex: Sex | null }) {
  const insets = useSafeAreaInsets();
  // Everything read goes in (no picking); where one test was read two ways, the surer reading.
  const values = (merged?.values ?? []).filter((v) => v.include);
  /** Fixed numbers, in the printed unit. */
  const [edits, setEdits] = useState<Record<string, number>>({});
  /** A printed date (or NO_DATE) → the date the user chose instead. */
  const [dates, setDates] = useState<Record<string, string>>({});
  const [picking, setPicking] = useState<{ from: string; value: WheelDate } | null>(null);
  // The order is set once, outside the range first: fixing a number must not move its row away
  // from under the user's finger.
  const [order] = useState(() => {
    const rank = (v: ReportValue) => outside(printedView(v, sex).words?.state);
    return new Map([...values].sort((a, b) => rank(a) - rank(b)).map((v, i) => [v.id, i]));
  });

  const dateOf = (v: ReportValue) => dates[v.date ?? NO_DATE] ?? v.date;
  /** A value with the user's fix applied (stored back in the canonical unit). */
  const fixed = (v: ReportValue): ReportValue => {
    const edit = edits[v.id];
    if (edit == null) return v;
    const unit = v.printedUnit ?? v.unit;
    const value = isAnalyteKey(v.metric) ? (toCanonical(v.metric, edit, unit) ?? edit) : edit;
    return { ...v, value, qualifier: null, raw: [String(edit), unit].filter(Boolean).join(' ') };
  };

  // A few dozen values: cheap enough to work out on each render.
  const views = new Map(values.map((v) => [v.id, printedView(fixed(v), sex)]));
  const byDate = new Map<string, ReportValue[]>();
  for (const v of values) {
    const key = v.date ?? NO_DATE;
    byDate.set(key, [...(byDate.get(key) ?? []), v]);
  }
  // Undated first (they need a date), then newest first.
  const groups = [...byDate.entries()]
    .sort(([a], [b]) => (a === NO_DATE ? -1 : b === NO_DATE ? 1 : b.localeCompare(a)))
    .map(([key, list]) => ({
      key,
      list: [...list].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
    }));

  const undated = values.some((v) => !dateOf(v));
  const n = values.length;

  const add = () => {
    const list: KeptValue[] = values.map((v) => ({ ...fixed(v), date: dateOf(v)! }));
    const added = confirmReport(id, list);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
    showToast(added ? `Added ${count(added)}` : 'These values were already added');
  };

  const discard = () =>
    Alert.alert('Discard this report?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          dismissReport(id);
          router.back();
        },
      },
    ]);

  const saveDate = () => {
    if (!picking) return;
    // A test can't be from the future.
    const today = dayKey(new Date());
    const chosen = wheelKey(picking.value);
    setDates((d) => ({ ...d, [picking.from]: chosen > today ? today : chosen }));
    setPicking(null);
  };

  return (
    <>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 180 }}>
        <Header title="Check your report" line="Tap a number to fix it." />
        {groups.map(({ key, list }) => {
          const shown = dates[key] ?? (key === NO_DATE ? null : key);
          return (
            <View key={key} className="mt-6 px-4">
              <View className="mb-2 flex-row items-center px-1">
                <Text className="flex-1 font-sans-medium text-[15px] text-text">
                  {shown ? dateLabel(shown) : 'No date on the report'}
                </Text>
                <PressScale
                  accessibilityRole="button"
                  onPress={() =>
                    setPicking({ from: key, value: wheelDate(shown ?? dayKey(new Date())) })
                  }
                  hitSlop={8}
                  className="rounded-pill bg-glass/10 px-3 py-1.5">
                  <Text className="font-sans-medium text-[13px] text-text">
                    {shown ? 'Change' : 'Set date'}
                  </Text>
                </PressScale>
              </View>
              <View className="gap-2">
                {list.map((v) => {
                  const view = views.get(v.id)!;
                  const note =
                    (v.conflict || v.confidence < CHECK_CONFIDENCE) && edits[v.id] == null
                      ? 'Check this one'
                      : null;
                  return (
                    <ReviewRow
                      key={v.id}
                      label={v.label}
                      rawName={v.rawName}
                      value={view.value}
                      qualifier={edits[v.id] != null ? null : v.qualifier}
                      unit={view.unit}
                      words={view.words?.words ?? null}
                      state={view.words?.state ?? null}
                      note={note}
                      onEdit={(value) => setEdits((e) => ({ ...e, [v.id]: value }))}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View
        className="absolute inset-x-0 bottom-0 border-t border-hairline/10 bg-bg px-6 pt-4"
        style={{ paddingBottom: insets.bottom + 8 }}>
        {undated ? (
          <Text className="mb-2 text-center font-sans text-[14px] text-muted">
            Set the date to add these
          </Text>
        ) : null}
        <PrimaryButton label={`Add ${count(n)}`} onPress={add} disabled={n === 0 || undated} />
        <QuietButton label="Discard" onPress={discard} />
      </View>

      <Sheet visible={!!picking} onClose={() => setPicking(null)} accessibilityLabel="Test date">
        <Text className="text-center font-sans-medium text-[17px] text-text">
          When was the test?
        </Text>
        {picking ? (
          <View className="mx-2 mt-6">
            <DateWheels
              value={picking.value}
              onChange={(value) => setPicking((p) => (p ? { ...p, value } : p))}
              years={YEARS}
            />
          </View>
        ) : null}
        <View className="mt-8">
          <PrimaryButton label="Use this date" onPress={saveDate} />
        </View>
      </Sheet>
    </>
  );
}

/** A report already added: its readings as stored, and Remove. */
function Added({ id, date, sex }: { id: string; date: string | null; sex: Sex | null }) {
  const insets = useSafeAreaInsets();
  const { data } = useLiveQuery(
    db
      .select()
      .from(vitalsReadings)
      .where(and(eq(vitalsReadings.reportId, id), isNull(vitalsReadings.deletedAt))),
    [id],
  );
  const remove = () =>
    Alert.alert('Remove this report?', 'Its values leave your Vitals too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          removeReport(id);
          router.back();
          showToast('Report removed');
        },
      },
    ]);

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <Header
          title="Report"
          line={date ? `${dateLabel(date)} · ${count(data.length)}` : count(data.length)}
        />
        <View className="mt-6 gap-2 px-4">
          {data
            .map((r) => {
              const range = rangeFor({ metric: r.metric, refLo: r.refLo, refHi: r.refHi }, sex);
              return { r, words: rangeWords(r.value, r.qualifier, range, r.unit || null) };
            })
            // Outside the range first, as on the check screen.
            .sort((a, b) => outside(a.words?.state) - outside(b.words?.state))
            .map(({ r, words }) => (
              <ReviewRow
                key={r.id}
                label={r.label ?? r.metric}
                value={r.value}
                qualifier={r.qualifier}
                unit={r.unit || null}
                words={words?.words ?? null}
                state={words?.state ?? null}
              />
            ))}
        </View>
      </ScrollView>
      <View
        className="absolute inset-x-0 bottom-0 border-t border-hairline/10 bg-bg px-6 pt-2"
        style={{ paddingBottom: insets.bottom + 8 }}>
        <QuietButton label="Remove report" onPress={remove} />
      </View>
    </>
  );
}
