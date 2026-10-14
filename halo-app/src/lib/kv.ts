import { createMMKV } from 'react-native-mmkv';

// Small synchronous app state (theme, settings, onboarding). Logs live in SQLite.
export const kv = createMMKV({ id: 'halo' });
