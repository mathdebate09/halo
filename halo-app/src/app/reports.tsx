import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronRightIcon, CloseIcon, ReportIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { ThemedScreen } from '@/components/themed-screen';
import { shortDate, useAddedReports, useLabResults } from '@/reports/lab-data';
import { ReviewRow } from '@/reports/review-row';
import { useHaloTheme } from '@/theme/theme-provider';

// Every result from the user's reports (Vitals shows only the familiar few): each test's latest
// value against its range, with how it moved since the report before, the ones outside their range
// first. Then the reports themselves, each opening to its values and Remove.

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useHaloTheme();
  const { results, counts } = useLabResults();
  const added = useAddedReports();
  // A row names its date only when it's older than the newest report (a test that one didn't have).
  const newest = results.reduce((d, r) => (r.day > d ? r.day : d), '');
  const words = (line: string | null, day: string) => {
    const when = day === newest ? null : `from ${shortDate(day)}`;
    return [line, when].filter(Boolean).join(' · ') || null;
  };

  return (
    <ThemedScreen>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
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
            Blood work
          </Text>
        </View>

        <View className="mt-6 gap-2 px-4">
          {results.map((r) => (
            <ReviewRow
              key={r.metric}
              label={r.label}
              value={r.value}
              qualifier={r.qualifier}
              unit={r.unit}
              words={words(r.line, r.day)}
              state={r.state}
            />
          ))}
        </View>

        {added.length > 0 ? (
          <View className="mt-8 px-4">
            <Text className="mb-2 px-1 font-sans text-[18px] text-text">Reports</Text>
            <View className="gap-2">
              {added.map((rep) => {
                const n = counts.get(rep.id) ?? 0;
                return (
                  <PressScale
                    key={rep.id}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({ pathname: '/report/[id]', params: { id: rep.id } })
                    }
                    className="flex-row items-center rounded-[20px] bg-glass/5 px-4 py-3">
                    <ReportIcon size={20} color={theme.colors.muted} />
                    <Text className="ml-3 flex-1 font-sans text-[16px] text-text">
                      {rep.reportDate ? shortDate(rep.reportDate) : 'Report'}
                    </Text>
                    <Text className="mr-2 font-sans text-[14px] text-muted">
                      {`${n} value${n === 1 ? '' : 's'}`}
                    </Text>
                    <ChevronRightIcon size={18} color={theme.colors.muted} />
                  </PressScale>
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </ThemedScreen>
  );
}
