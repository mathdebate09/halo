import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressScale } from '@/components/press-scale';
import { showToast } from '@/components/toast';
import { prepareHero } from '@/share/photo';
import { BusyOverlay, compose } from '@/share/sources/parts';
import { useHaloTheme } from '@/theme/theme-provider';
import { type Tier, themeIds, themes, tierGradients } from '@/theme/themes';

const TIERS: Tier[] = ['high', 'mid', 'low'];

/** Today's hero first, then the other heroes, then the three tier gradients. */
export function HaloGrid() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { target } = useHaloTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const heroes = [target.id, ...themeIds.filter((id) => id !== target.id)];
  const tileW = (width - 32 - 16) / 3;
  const tileH = tileW * (16 / 9);

  const pickHero = async (id: string, url: string) => {
    if (busy) return;
    setBusy(id);
    try {
      compose(await prepareHero(url));
    } catch {
      showToast('That one needs a connection the first time');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView
      contentContainerClassName="flex-row flex-wrap gap-2 px-4 pt-2"
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
      {heroes.map((id) => (
        <PressScale
          key={id}
          accessibilityRole="imagebutton"
          accessibilityLabel={id === target.id ? "Today's hero" : 'Halo hero'}
          onPress={() => pickHero(id, themes[id].image)}
          className="overflow-hidden rounded-[14px]"
          style={{ width: tileW, height: tileH }}>
          <Image
            source={{ uri: themes[id].image }}
            placeholder={{ blurhash: themes[id].blurhash }}
            cachePolicy="memory-disk"
            style={{ flex: 1 }}
            contentFit="cover"
          />
          {busy === id ? <BusyOverlay /> : null}
        </PressScale>
      ))}
      {TIERS.map((tier) => (
        <PressScale
          key={tier}
          accessibilityRole="imagebutton"
          accessibilityLabel={`${tier} gradient`}
          onPress={() => router.push({ pathname: '/share/compose', params: { gradient: tier } })}
          className="overflow-hidden rounded-[14px]"
          style={{ width: tileW, height: tileH }}>
          <LinearGradient colors={tierGradients[tier]} style={{ flex: 1 }} />
        </PressScale>
      ))}
    </ScrollView>
  );
}
