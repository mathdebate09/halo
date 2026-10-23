import * as Haptics from 'expo-haptics';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloseIcon } from '@/components/icons';
import { setToastLift } from '@/components/toast';
import { ThemedScreen } from '@/components/themed-screen';
import { reanalyse } from '@/meals/analysis';
import { AnalysingCard } from '@/meals/analysing-card';
import { saveMeal } from '@/meals/capture';
import { LoggerActions } from '@/meals/logger-actions';
import { MealCamera } from '@/meals/meal-camera';
import { NoteBar } from '@/meals/note-bar';
import { ResultSection } from '@/meals/result-section';
import { useActiveMeal } from '@/meals/use-active-meal';
import { WaterSheet } from '@/meals/water-sheet';
import { useHaloTheme } from '@/theme/theme-provider';
import { useMealReaction } from '@/today/celebration';
import { useTodayScores } from '@/today/today-scores';

// The Meal Logger section (the dock's plus). One card does the whole flow in place: the camera,
// then the sent photo under the AI loader, then the analysis as an editable section with Log and
// Reject, then the camera again. The note bar below follows along: a note, "Analysing…", then a
// correction that re-runs the analysis.

const CARD_RADIUS = 44;

export default function MealLogger() {
  const insets = useSafeAreaInsets();
  const { theme } = useHaloTheme();
  const focused = useIsFocused();
  const params = useLocalSearchParams<{ note?: string }>();
  const { reaction, reset: resetReaction } = useMealReaction(useTodayScores());
  const { activeId, setActiveId, meal, items, mode } = useActiveMeal(focused);

  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [capture, setCapture] = useState(0); // remounts the camera after each round
  const [card, setCard] = useState({ width: 0, height: 0 });
  const [waterSheet, setWaterSheet] = useState(false);

  // Leaving the logger resets the camera card to its blurred "Meal Logger" face: coming back
  // asks for a tap again instead of opening straight into a live viewfinder. A photo already
  // taken (not yet sent) stays.
  useEffect(() => {
    if (!focused) setCapture((c) => c + 1);
  }, [focused]);

  // Toasts (the reaction after Log) float above the action row while the logger is open.
  useEffect(() => {
    setToastLift('logger', focused ? 84 : 0);
    return () => setToastLift('logger', 0);
  }, [focused]);

  // Opened from a Learn more suggestion: the note arrives pre-filled, ready to send or edit.
  useEffect(() => {
    if (!params.note) return;
    if (!activeId) setNote(params.note);
    router.setParams({ note: undefined });
  }, [params.note, activeId]);

  const canSend = mode === 'capture' ? !!photo || note.trim().length > 0 : note.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (mode === 'result' && meal) {
      reanalyse(meal.id, note);
    } else {
      const saved = saveMeal({ photoUri: photo, note });
      setActiveId(saved.id);
      setPhoto(null);
    }
    setNote('');
  };

  const finish = () => {
    resetReaction();
    setActiveId(null);
    setCapture((c) => c + 1);
  };

  return (
    <ThemedScreen>
      <View
        className="flex-1 px-4"
        // On a plain View: KeyboardAvoidingView owns its own bottom padding.
        style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}>
        <View className="mb-3 flex-row justify-end">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close the logger"
            // Always home to Today, wherever the logger was opened from.
            onPress={() => router.navigate('/')}
            hitSlop={8}
            className="h-11 w-11 items-center justify-center rounded-full bg-glass/10 active:bg-glass/20">
            <CloseIcon size={22} color={theme.colors.text} />
          </Pressable>
        </View>
        <KeyboardAvoidingView behavior="padding" className="flex-1">
          <View
            className="flex-1"
            onLayout={(e) =>
              setCard({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
            }>
            {mode === 'capture' ? (
              <Animated.View
                key={`cam${capture}`}
                entering={FadeIn.duration(450)}
                style={styles.fill}>
                <MealCamera active={focused} photo={photo} onPhoto={setPhoto} />
              </Animated.View>
            ) : null}

            {mode === 'analysing' && meal ? (
              <AnalysingCard meal={meal} radius={CARD_RADIUS} />
            ) : null}

            {mode === 'result' && meal && card.width > 0 ? (
              <ResultSection
                key={`${meal.id}:${meal.jobId ?? ''}`}
                meal={meal}
                items={items}
                size={card}
                radius={CARD_RADIUS}
                reaction={reaction}
                onDone={finish}
              />
            ) : null}
          </View>

          <NoteBar mode={mode} note={note} onChangeNote={setNote} canSend={canSend} onSend={send} />
        </KeyboardAvoidingView>

        <LoggerActions note={note} onWaterMore={() => setWaterSheet(true)} />
      </View>

      <WaterSheet visible={waterSheet} onClose={() => setWaterSheet(false)} />
    </ThemedScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
