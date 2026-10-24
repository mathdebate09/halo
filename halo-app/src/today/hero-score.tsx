import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig } from 'react-native-reanimated';

import { Reveal } from '@/components/reveal';
import { ScoreArc, ScoreScrim } from '@/components/score-arc';

// Screen-height fractions, so the arc sits over the hero image's focus point.
const SCORE_AT = 0.43;
const SCORE_SIZE = 112;
// Instrument Serif's ascenders overflow a line height equal to the font size.
const SCORE_LINE = 132;
const LABEL_AT = 0.478;

/** The hero's overall score: the arc, the number (fading on change) and its label. */
export function HeroScore({
  score,
  provisional,
  glow,
  width,
  height,
}: {
  score: number;
  provisional: boolean;
  /** Bump to play the arc's glow (a meal was just logged). */
  glow: number;
  width: number;
  height: number;
}) {
  return (
    <Reveal index={2} className="absolute inset-0" pointerEvents="none">
      <ScoreScrim centerY={SCORE_AT * height} width={width} />
      <ScoreArc score={score} provisional={provisional} glow={glow} width={width} height={height} />
      <View
        className="absolute inset-x-0 items-center"
        style={{ top: SCORE_AT * height - SCORE_LINE / 2, height: SCORE_LINE }}
        accessible
        accessibilityLabel={`${provisional ? 'Early read' : 'Overall score'} ${score}`}>
        <LayoutAnimationConfig skipEntering>
          <Animated.Text
            key={score}
            entering={FadeIn.duration(500)}
            exiting={FadeOut.duration(300)}
            className="absolute font-serif text-text"
            style={{ fontSize: SCORE_SIZE, lineHeight: SCORE_LINE }}>
            {score}
          </Animated.Text>
        </LayoutAnimationConfig>
      </View>
      <Text
        className="absolute inset-x-0 text-center font-sans-medium text-[13px] tracking-[2px] text-text/90"
        style={{ top: LABEL_AT * height }}>
        {provisional ? 'EARLY READ' : 'OVERALL'}
      </Text>
    </Reveal>
  );
}
