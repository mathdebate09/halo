import { colorVars, type ThemeColors } from '@/theme/themes';

// The Advisor is the one light screen (decisions log, chunk 19/21): the same tokens, light values,
// set on its root only, so every class (`bg-surface`, `text-muted`, `bg-glass/10`) just works.
export const ADVISOR_COLORS: ThemeColors = {
  bg: '#f3f0ea',
  surface: '#ffffff',
  glass: '#1c2230',
  hairline: '#1c2230',
  text: '#1c2230',
  muted: '#5f6470',
  accent: '#2f4058',
  onAccent: '#f3f0ea',
  arc: '#1c2230',
  dock: '#ffffff',
  veil: '#1c2230',
  strength: '#2c7a8f',
  steady: '#6a7034',
  opportunity: '#b0543b',
};

export const advisorVars = colorVars(ADVISOR_COLORS);
