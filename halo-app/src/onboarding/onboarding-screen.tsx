import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Height reserved under the status bar for the persistent progress header. */
export const HEADER_SPACE = 64;

type Props = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  /** Pinned to the bottom: the primary action, and optionally a quiet one. */
  footer?: ReactNode;
};

/** Question screen scaffold: serif question, muted helper, content, pinned actions. */
export function OnboardingScreen({ title, subtitle, children, footer }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6"
        contentContainerStyle={{ paddingTop: insets.top + HEADER_SPACE, paddingBottom: 24 }}>
        <Text
          accessibilityRole="header"
          className="font-serif text-[38px] leading-[44px] text-text">
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-3 font-sans text-[17px] leading-[25px] text-muted">{subtitle}</Text>
        ) : null}
        <View className="mt-8">{children}</View>
      </ScrollView>
      {footer ? (
        <View className="gap-1 px-6 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}
