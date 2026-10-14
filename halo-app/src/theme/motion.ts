import { Easing } from 'react-native-reanimated';

// Slow, eased, no bounce (Oura calm).
export const motion = {
  themeFade: 600,
  calm: Easing.bezier(0.4, 0, 0.2, 1),
} as const;
