import { useState } from 'react';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { HeroBackdrop } from '@/components/hero-backdrop';
import { Btn, Row } from '@/dev/ui';
import { useHaloTheme } from '@/theme/theme-provider';
import { themeIds, zones } from '@/theme/themes';

export function ThemesRow() {
  const { theme, target, setThemeId } = useHaloTheme();
  const [preview, setPreview] = useState(false);
  const { height } = useWindowDimensions();
  const next = () => setThemeId(themeIds[(themeIds.indexOf(target.id) + 1) % themeIds.length]);

  return (
    <Row
      title="Themes"
      status={`${target.id} · veil ${target.veil.alpha} · contrast ${target.contrast.tagline}/${target.contrast.body}`}>
      {themeIds.map((id) => (
        <Pressable
          key={id}
          onPress={() => setThemeId(id)}
          className={`rounded-pill px-3 py-1.5 ${id === target.id ? 'bg-accent' : 'bg-glass/10'}`}>
          <Text
            className={`font-sans-medium text-[13px] ${id === target.id ? 'text-on-accent' : 'text-text'}`}>
            {id}
          </Text>
        </Pressable>
      ))}
      <Btn label="Preview hero" onPress={() => setPreview(true)} />

      <Modal
        visible={preview}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPreview(false)}>
        <Pressable onPress={next} className="flex-1 bg-bg">
          <HeroBackdrop />
          <Text className="absolute left-6 top-12 font-sans text-[13px] text-text/80">
            {theme.id} · tap to cycle
          </Text>
          <Pressable
            onPress={() => setPreview(false)}
            className="absolute right-6 top-10 rounded-pill bg-glass/15 px-4 py-2">
            <Text className="font-sans-medium text-[13px] text-text">Close</Text>
          </Pressable>
          <Text
            style={{ top: height * 0.36 }}
            className="absolute inset-x-0 text-center font-serif text-[96px] leading-[104px] text-text">
            82
          </Text>
          <Text
            style={{ top: height * zones.tagline[0] }}
            className="absolute inset-x-0 text-center font-serif text-[46px] leading-[52px] text-text">
            Go get ’em
          </Text>
          <Text
            style={{ top: height * zones.body[0] }}
            className="absolute inset-x-8 text-center font-sans text-[17px] leading-[26px] text-text/90">
            Breakfast landed right on pace and your steps are ahead of yesterday. A protein-rich
            lunch keeps the momentum going.
          </Text>
          <View
            style={{ top: height * 0.86 }}
            className="absolute inset-x-6 flex-row justify-between">
            <Text className="font-sans-medium text-[13px] tracking-[2px] text-strength">
              THRIVING
            </Text>
            <Text className="font-sans-medium text-[13px] tracking-[2px] text-steady">STEADY</Text>
            <Text className="font-sans-medium text-[13px] tracking-[2px] text-opportunity">
              NEEDS CARE
            </Text>
          </View>
        </Pressable>
      </Modal>
    </Row>
  );
}
