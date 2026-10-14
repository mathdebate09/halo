import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

// Change listeners power drizzle's useLiveQuery, so screens re-render when rows change.
export const sqlite = openDatabaseSync('halo.db', { enableChangeListener: true });
export const db = drizzle(sqlite, { schema });
export type Db = typeof db;
