// The sticker registry: every preset the drawer offers, in drawer order per tab. Each renders
// from the frozen day snapshot alone (local data, works offline), in the variant a tap selects.

import type { ReactNode } from 'react';

import type { ShareSnapshot } from '../snapshot';
import type { Variant } from './ink';
import {
  ArcScore,
  ChatBubble,
  CondensedScore,
  Handwritten,
  HeartPill,
  Highlighter,
  LedReadout,
  SerifHeadline,
} from './today';
import { MacroRing, MonoBlock, Receipt, SplitBars, ThisWeek, WaterDropSticker } from './totals';

export { nextVariant, VARIANTS, type Variant } from './ink';

export type PresetTab = 'today' | 'totals';

export type Preset = {
  id: string;
  tab: PresetTab;
  label: string;
  render: (snapshot: ShareSnapshot, variant: Variant) => ReactNode;
};

type Sticker = (props: { snapshot: ShareSnapshot; variant: Variant }) => ReactNode;
const preset = (id: string, tab: PresetTab, label: string, Component: Sticker): Preset => ({
  id,
  tab,
  label,
  render: (snapshot, variant) => <Component snapshot={snapshot} variant={variant} />,
});

export const PRESETS: Preset[] = [
  preset('arc', 'today', 'Arc and score', ArcScore),
  preset('serif', 'today', 'Headline', SerifHeadline),
  preset('condensed', 'today', 'Score and macros', CondensedScore),
  preset('heart', 'today', 'Heart', HeartPill),
  preset('chat', 'today', 'Message', ChatBubble),
  preset('highlighter', 'today', 'Highlighted note', Highlighter),
  preset('handwritten', 'today', 'Handwritten', Handwritten),
  preset('led', 'today', 'LED readout', LedReadout),
  preset('ring', 'totals', 'Macro ring', MacroRing),
  preset('bars', 'totals', 'Macro bars', SplitBars),
  preset('mono', 'totals', 'Data readout', MonoBlock),
  preset('receipt', 'totals', 'Receipt', Receipt),
  preset('water', 'totals', 'Water', WaterDropSticker),
  preset('week', 'totals', 'This week', ThisWeek),
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);
