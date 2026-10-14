import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { type ReactNode, useEffect } from 'react';
import { Text, View } from 'react-native';

import { ensureDevice } from '@/lib/device';

import migrations from '../../drizzle/migrations';
import { db } from './client';

/**
 * Runs pending SQLite migrations before anything renders. They take milliseconds and the native
 * splash stays up meanwhile (LaunchSequence hides it only once mounted), so there's no flash.
 */
export function DataGate({ children }: { children: ReactNode }) {
  const { success, error } = useMigrations(db, migrations);

  useEffect(() => {
    if (success) ensureDevice();
  }, [success]);

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-8">
        <Text className="text-center font-serif text-[28px] text-text">
          Halo couldn’t open its data
        </Text>
        <Text className="mt-3 text-center font-sans text-[15px] text-muted" selectable>
          {error.message}
        </Text>
      </View>
    );
  }
  if (!success) return null;
  return children;
}
