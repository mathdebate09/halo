import { router } from 'expo-router';
import { type ComponentType, type ReactNode, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn } from 'react-native-reanimated';

import {
  CaloriesIcon,
  CarbsIcon,
  FatIcon,
  MealScoreIcon,
  ProteinIcon,
  SummaryIcon,
  WaterDropIcon,
} from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { showToast } from '@/components/toast';
import { connectHealthConnect, refreshHealthData } from '@/lib/health-connect';
import { addWater } from '@/lib/water';
import { daySummary, type NextAction, type SummaryTab, summaryPanel, TAB_LABELS } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';
import { withAlpha } from '@/theme/themes';

import { MacroWheel } from './macro-wheel';
import { RevealText } from './reveal-text';
import type { TodayScores } from './today-scores';
import { WaterDrop } from './water-drop';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

const ICONS: Partial<Record<SummaryTab, ComponentType<{ size?: number; color: string }>>> = {
  calories: CaloriesIcon,
  protein: ProteinIcon,
  carbs: CarbsIcon,
  fat: FatIcon,
  meal: MealScoreIcon,
  water: WaterDropIcon,
};

/**
 * Learn more (SPEC §3, after the Nutrie summary): a Summary card whose figures are chips, and
 * one card below showing the chip that's selected: the macro wheel (meal score and the macros)
 * or the water drop, with a single line on pace.
 */
export function LearnMore({ scores, armed }: { scores: TodayScores; armed: boolean }) {
  const { theme } = useHaloTheme();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<SummaryTab>('meal');
  const facts = scores.facts;
  const panel = summaryPanel(tab, facts);
  const visual = tab === 'water' ? 'water' : 'wheel';
  const Icon = ICONS[tab] ?? MealScoreIcon;

  return (
    <View>
      <View className="rounded-[28px] border border-hairline/10 bg-surface px-5 pb-5 pt-4">
        <Label icon={<SummaryIcon size={16} color={theme.colors.accent} />} text="Summary" />
        <View className="mt-3">
          <RevealText
            segments={daySummary(facts)}
            armed={armed}
            size="large"
            selected={tab}
            onChip={setTab}
            chipIcon={(t, active) => {
              const ChipIcon = ICONS[t];
              return ChipIcon ? (
                <ChipIcon size={16} color={active ? theme.colors.text : theme.colors.muted} />
              ) : null;
            }}
          />
        </View>
      </View>

      <View className="mt-3 rounded-[28px] border border-hairline/10 bg-surface px-5 pb-6 pt-4">
        <Label icon={<Icon size={16} color={theme.colors.accent} />} text={TAB_LABELS[tab]} />
        <Animated.View
          key={visual}
          entering={FadeIn.duration(350).easing(EASE_OUT)}
          className="mt-4 items-center">
          {visual === 'water' ? (
            <WaterDrop
              ml={facts.waterMl}
              target={facts.targets.waterMl}
              width={Math.min(200, width * 0.5)}
              armed={armed}
            />
          ) : (
            <MacroWheel tab={tab} facts={facts} size={Math.min(230, width * 0.58)} armed={armed} />
          )}
        </Animated.View>
        {/* What's done and the pace, in a line; a suggestion only when the day is behind. */}
        <View className="mt-4">
          <RevealText key={tab} segments={[{ t: panel.pace }]} armed={armed} center />
        </View>
        {panel.nudge && panel.next.action ? (
          <Animated.View
            key={`next:${tab}`}
            entering={FadeIn.duration(300).delay(250)}
            className="mt-4 items-center">
            <PressScale
              accessibilityRole="button"
              onPress={() => runNext(panel.next.action)}
              className="rounded-pill bg-glass/10 px-5 py-2.5 active:bg-glass/20">
              <Text className="font-sans-medium text-[15px] text-text">{panel.next.text}</Text>
            </PressScale>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

/** Nutrie's card label: a tinted pill with an icon. */
function Label({ icon, text }: { icon: ReactNode; text: string }) {
  const { theme } = useHaloTheme();
  return (
    <View
      className="flex-row items-center self-start rounded-pill px-3 py-1.5"
      style={{ backgroundColor: withAlpha(theme.colors.accent, 0.14) }}>
      {icon}
      <Text className="ml-1.5 font-sans-medium text-[15px]" style={{ color: theme.colors.accent }}>
        {text}
      </Text>
    </View>
  );
}

/** Next acts where it can (water), pre-fills the logger for food, and connects missing sources. */
async function runNext(action: NextAction) {
  if (!action) return;
  if (action.kind === 'water') {
    addWater(action.ml);
    showToast(`${action.ml} ml water added`);
  } else if (action.kind === 'log') {
    router.navigate({ pathname: '/log', params: { note: action.note } });
  } else {
    await connectHealthConnect();
    refreshHealthData(true);
  }
}
