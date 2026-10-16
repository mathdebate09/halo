import { and, eq, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { QuietButton } from '@/components/button';
import { CloseIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { ThemedScreen } from '@/components/themed-screen';
import { showToast } from '@/components/toast';
import { db } from '@/db/client';
import { reports, vitalsReadings } from '@/db/schema';
import { useProfile } from '@/lib/plan';
import { fixReading, removeReport } from '@/reports/confirm';
import { ReviewRow } from '@/reports/review-row';
import { dayStart, rangeFor, rangeShort, rangeWords, STATE_WORDS } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';

// One report's values as they went into Vitals (it's added as soon as it's read, no check step).
// A number read wrong is fixed with a tap; Remove takes the report and its values out of Vitals.

const dateLabel = (day: string) =>
  dayStart(day, 12).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
const count = (n: number) => `${n} value${n === 1 ? '' : 's'}`;
const outside = (state: string | null | undefined) =>
  state === 'above' || state === 'below' ? 0 : 1;

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { theme } = useHaloTheme();
  const sex = useProfile()?.sex ?? null;
  const { data: rows } = useLiveQuery(
    db
      .select({ reportDate: reports.reportDate })
      .from(reports)
      .where(and(eq(reports.id, id), isNull(reports.deletedAt))),
    [id],
  );
  const { data } = useLiveQuery(
    db
      .select()
      .from(vitalsReadings)
      .where(and(eq(vitalsReadings.reportId, id), isNull(vitalsReadings.deletedAt))),
    [id],
  );
  const date = rows[0]?.reportDate ?? null;
  // A row keeps the place it first had: fixing a number mustn't move it away from the finger.
  const places = useRef(new Map<string, number>());

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
    <ThemedScreen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
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
            Report
          </Text>
          <Text className="mt-1 font-sans text-[15px] text-muted">
            {date ? `${dateLabel(date)} · ${count(data.length)}` : count(data.length)}
          </Text>
        </View>
        <View className="mt-6 gap-2 px-4">
          {data
            .map((r) => {
              const range = rangeFor({ metric: r.metric, refLo: r.refLo, refHi: r.refHi }, sex);
              const state = rangeWords(r.value, r.qualifier, range, r.unit || null)?.state ?? null;
              // Outside the range first, as everywhere else.
              if (!places.current.has(r.id)) places.current.set(r.id, outside(state));
              return { r, range, state, place: places.current.get(r.id)! };
            })
            .sort((a, b) => a.place - b.place)
            .map(({ r, range, state }) => (
              <ReviewRow
                key={r.id}
                label={r.label ?? r.metric}
                value={r.value}
                qualifier={r.qualifier}
                unit={r.unit || null}
                state={state}
                stateWord={state ? STATE_WORDS[state] : null}
                expected={rangeShort(range)}
                onEdit={(value) => fixReading(r.id, value)}
              />
            ))}
        </View>
      </ScrollView>
      <View
        className="absolute inset-x-0 bottom-0 border-t border-hairline/10 bg-bg px-6 pt-2"
        style={{ paddingBottom: insets.bottom + 8 }}>
        <QuietButton label="Remove report" onPress={remove} />
      </View>
    </ThemedScreen>
  );
}
