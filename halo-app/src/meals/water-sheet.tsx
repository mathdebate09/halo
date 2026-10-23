import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { PressScale } from '@/components/press-scale';
import { Sheet } from '@/components/sheet';
import { addWater, DEFAULT_GLASS_ML } from '@/lib/water';
import { useHaloTheme } from '@/theme/theme-provider';

const WATER_PRESETS = [150, 250, 330, 500];

/** The logger's Water long-press: a few glass sizes, or any amount from 50 to 2000 ml. */
export function WaterSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useHaloTheme();
  const [customMl, setCustomMl] = useState('');

  const custom = Number(customMl);
  const customValid = Number.isFinite(custom) && custom >= 50 && custom <= 2000;
  const add = (ml: number) => {
    onClose();
    setCustomMl('');
    addWater(ml);
  };

  return (
    <Sheet visible={visible} onClose={onClose} accessibilityLabel="Add water">
      <Text className="font-serif text-[32px] text-text">Water</Text>
      <View className="mt-5 flex-row gap-2">
        {WATER_PRESETS.map((ml) => (
          <PressScale
            key={ml}
            accessibilityRole="button"
            onPress={() => add(ml)}
            pressableStyle={styles.fill}
            className={`items-center rounded-pill py-3 ${ml === DEFAULT_GLASS_ML ? 'bg-glass/20' : 'bg-glass/10'}`}>
            <Text className="font-sans-medium text-[15px] text-text">{ml} ml</Text>
          </PressScale>
        ))}
      </View>
      <View className="mt-3 flex-row items-center rounded-pill border border-hairline/10 bg-glass/10 py-1.5 pl-5 pr-1.5">
        <TextInput
          value={customMl}
          onChangeText={(t) => setCustomMl(t.replace(/[^0-9]/g, ''))}
          placeholder="Other amount"
          placeholderTextColor={theme.colors.muted}
          keyboardType="number-pad"
          maxLength={4}
          className="flex-1 py-2 font-sans text-[16px] text-text"
          accessibilityLabel="Water in millilitres"
        />
        <Text className="mr-3 font-sans text-[15px] text-muted">ml</Text>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel="Add"
          disabled={!customValid}
          onPress={() => add(custom)}
          className={`rounded-pill bg-text px-5 py-2.5 ${customValid ? '' : 'opacity-30'}`}>
          <Text className="font-sans-medium text-[15px] text-bg">Add</Text>
        </PressScale>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
