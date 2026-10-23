import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

/** A summary card: a muted title and its content on one seamless surface. */
export function Card({
  title,
  className = '',
  style,
  children,
}: {
  title: string;
  className?: string;
  style?: { width: number };
  children: ReactNode;
}) {
  return (
    // One continuous surface: the title is a quiet label in the same padding, no rule under it.
    <View className={`rounded-card bg-surface px-4 pb-4 pt-3.5 ${className}`} style={style}>
      <Text className="mb-2 font-sans-medium text-[15px] text-muted">{title}</Text>
      {children}
    </View>
  );
}

/** A big coloured number with its unit in small caps after it ("5.9 KM", "9:40 /KM"). */
export function ValueWithUnit({ text, color }: { text: string; color: string }) {
  const [value, ...rest] = text.split(' ');
  return (
    <Text className="font-sans-medium text-[32px] leading-[40px]" style={{ color }}>
      {value}
      {rest.length ? (
        <Text className="font-sans-medium text-[17px]"> {rest.join(' ').toUpperCase()}</Text>
      ) : null}
    </Text>
  );
}

/** One line of the Activity card: "Active" over "279/810 KCAL" in the metric's colour. */
export function Figure({
  label,
  value,
  of,
  unit,
  color,
  big = false,
}: {
  label: string;
  value: string;
  of?: string;
  unit?: string;
  color: string;
  big?: boolean;
}) {
  return (
    <View>
      <Text className="font-sans text-[14px] text-text">{label}</Text>
      <Text
        className={`font-sans-medium ${big ? 'text-[26px] leading-[32px]' : 'text-[20px] leading-[26px]'}`}
        style={{ color }}>
        {value}
        {of ? `/${of}` : ''}
        {unit ? <Text className="text-[13px]"> {unit}</Text> : null}
      </Text>
    </View>
  );
}
