import { useRef, useState } from 'react';

import { nextVariant, type Variant } from '@/share/presets';

export type PlacedSticker = { key: number; presetId: string; variant: Variant; z: number };

const topZ = (list: PlacedSticker[]) => Math.max(0, ...list.map((s) => s.z)) + 1;

/** The stickers placed on the share card: add one on top, raise it, cycle its look, remove it. */
export function useStickers() {
  const [stickers, setStickers] = useState<PlacedSticker[]>([]);
  const nextKey = useRef(1);

  const update = (
    key: number,
    change: (s: PlacedSticker, list: PlacedSticker[]) => Partial<PlacedSticker>,
  ) => setStickers((list) => list.map((s) => (s.key === key ? { ...s, ...change(s, list) } : s)));

  return {
    stickers,
    add: (presetId: string) => {
      const key = nextKey.current++;
      setStickers((list) => [...list, { key, presetId, variant: 'light', z: topZ(list) }]);
    },
    raise: (key: number) => update(key, (_, list) => ({ z: topZ(list) })),
    cycle: (key: number) => update(key, (p) => ({ variant: nextVariant(p.variant) })),
    remove: (key: number) => setStickers((list) => list.filter((x) => x.key !== key)),
  };
}
