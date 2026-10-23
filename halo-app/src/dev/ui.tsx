import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

export function errorText(e: unknown) {
  const err = e as { code?: string; message?: string };
  return `✕ ${err.code ? `${err.code}: ` : ''}${err.message ?? String(e)}`;
}

export function Row({
  title,
  status,
  children,
}: {
  title: string;
  status: string;
  children?: ReactNode;
}) {
  return (
    <View className="mb-3 rounded-card border border-hairline/10 bg-surface p-4">
      <Text className="font-sans-medium text-[15px] text-text">{title}</Text>
      <Text className="mt-1 font-sans text-[13px] text-muted" selectable>
        {status}
      </Text>
      {children ? <View className="mt-3 flex-row flex-wrap gap-2">{children}</View> : null}
    </View>
  );
}

export function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="rounded-pill bg-glass/10 px-4 py-2 active:bg-glass/20">
      <Text className="font-sans-medium text-[13px] text-text">{label}</Text>
    </Pressable>
  );
}
