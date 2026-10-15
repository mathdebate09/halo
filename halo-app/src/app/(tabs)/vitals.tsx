import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  openUsageAccess,
  refreshScreenNights,
  type UsageAccess,
  usageAccess,
} from '@/assistant/screen';
import { useDockInset } from '@/components/dock';
import { ThemedScreen } from '@/components/themed-screen';
import {
  connectHealthConnect,
  healthConnectState,
  type HealthConnectState,
  refreshHealthData,
} from '@/lib/health-connect';
import { useUnits } from '@/lib/units';
import { type Area, AREA_LABELS, AREA_PRIORITY, type AreaKey, vitalsDetail } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';
import { useTodayScores } from '@/today/today-scores';
import { AreaCard } from '@/vitals/area-card';
import { AREA_ICONS } from '@/vitals/areas';
import { VitalsHero } from '@/vitals/hero';
import { EmptyRow, MetricRow } from '@/vitals/metric-row';
import { areaSummary } from '@/vitals/summary';

// Vitals (SPEC §3), never called My Health: the hero (areas on their bands, one headline, one
// step), then every area in detail below the fold: its card (state and a plain sentence), then
// its readings against their usual band. An area with nothing to read asks for the one source
// that could fill it, or says there's no data when that source is already there (never an
// estimate).

export default function VitalsScreen() {
  const insets = useSafeAreaInsets();
  const dockInset = useDockInset();
  const { height } = useWindowDimensions();
  const { day, vitalsReport, vitalsInput } = useTodayScores();
  const [units] = useUnits();
  const pounds = units.weight === 'lb';
  const detail = vitalsDetail(vitalsInput, vitalsReport);

  // Whether Health Connect is there decides between "Connect" and "No data" for an empty area.
  const [hc, setHc] = useState<HealthConnectState | null>(null);
  const checkHc = useCallback(() => {
    healthConnectState().then(setHc);
  }, []);
  useFocusEffect(checkHc);
  const connect = async () => {
    await connectHealthConnect();
    await refreshHealthData(true);
    checkHc();
  };
  const usage = usageAccess();

  // Back from Usage access settings: read the screen straight away instead of waiting out the
  // throttle, so the screen-time rows fill in.
  const askedUsage = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !askedUsage.current) return;
      askedUsage.current = false;
      if (usageAccess() === 'granted') refreshScreenNights(true);
    });
    return () => sub.remove();
  }, []);

  const scroll = useRef<ScrollView>(null);
  const detailY = useRef(0);
  const openDetail = () =>
    scroll.current?.scrollTo({ y: detailY.current - insets.top - 8, animated: true });

  return (
    <ThemedScreen>
      <ScrollView
        ref={scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: dockInset }}>
        <VitalsHero top={insets.top} bottom={dockInset} height={height} onDetail={openDetail} />

        {/* At least a screen tall, so the Vitals pill can always bring the header to the top. */}
        <View
          className="px-4"
          style={{ minHeight: height - insets.top - dockInset }}
          onLayout={(e) => {
            detailY.current = e.nativeEvent.layout.y;
          }}>
          <Text accessibilityRole="header" className="mt-8 px-1 font-serif text-[34px] text-text">
            Vitals
          </Text>
          {AREA_PRIORITY.map((key) => {
            const area = vitalsReport.areas.find((a) => a.key === key);
            const rows = detail.rows.filter((r) => r.area === key);
            const missing = detail.stubs.some((st) => st.area === key);
            // Screen time without the module (an older build) has nothing to offer.
            if (key === 'screen' && !area && usage === 'unavailable') return null;
            if (!area && rows.length === 0 && !missing) return null;
            const empty = emptyKind(key, area, hc, usage);
            return (
              <View key={key} className="mt-6 gap-2">
                {area ? (
                  <AreaCard area={area} summary={areaSummary(area, rows, vitalsInput, pounds)} />
                ) : (
                  <AreaHeader areaKey={key} />
                )}
                {rows.map((row) => (
                  <MetricRow key={row.key} row={row} today={day} pounds={pounds} />
                ))}
                {empty ? (
                  <EmptyRow
                    kind={empty}
                    onPress={
                      empty === 'connect'
                        ? connect
                        : () => {
                            askedUsage.current = true;
                            openUsageAccess();
                          }
                    }
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </ThemedScreen>
  );
}

type Empty = 'connect' | 'no_data' | 'usage_access';

/**
 * What an area without readings shows under it, if anything: screen time asks for Usage access
 * (or says no data once allowed); the rest offer Health Connect until it's connected, then say
 * there's no data. An area with readings needs nothing.
 */
function emptyKind(
  key: AreaKey,
  area: Area | undefined,
  hc: HealthConnectState | null,
  usage: UsageAccess,
): Empty | null {
  if (key === 'screen') {
    if (area) return null;
    return usage === 'granted' ? 'no_data' : 'usage_access';
  }
  if (area && area.source !== 'assumed') return null;
  if (hc == null) return null; // still checking
  if (hc !== 'connected') return 'connect';
  return area ? null : 'no_data';
}

/** An area with nothing measured yet: just its name, then the asks under it. */
function AreaHeader({ areaKey }: { areaKey: AreaKey }) {
  const { theme } = useHaloTheme();
  const Icon = AREA_ICONS[areaKey];
  return (
    <View className="flex-row items-center px-1 pb-1">
      <Icon size={20} color={theme.colors.muted} />
      <Text className="ml-2 font-sans text-[18px] text-text">{AREA_LABELS[areaKey]}</Text>
    </View>
  );
}
