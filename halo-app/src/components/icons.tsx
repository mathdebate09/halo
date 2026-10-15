import Svg, { Circle, Path } from 'react-native-svg';

// Thin monochrome line icons in Oura's style (1.5 stroke on a 24 grid).

type IconProps = { size?: number; color: string };

function Line({ size = 24, color, children }: IconProps & { children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round">
      {children}
    </Svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Circle cx={12} cy={12} r={4} />
      <Path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </Line>
  );
}

export function SunsetIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M7.5 16a4.5 4.5 0 0 1 9 0M3 16h18M6 20h12M12 5v3M4.6 9.6l1.6 1.2M19.4 9.6l-1.6 1.2" />
    </Line>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M19.5 14.6A7.5 7.5 0 1 1 9.4 4.5a6 6 0 0 0 10.1 10.1z" />
    </Line>
  );
}

export function ExerciseIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M12 21a5.5 5.5 0 0 1-5.5-5.5c0-2.6 1.6-4.2 2.9-5.6.2 1.6 1 2.6 2.1 3 0-3.4 1.2-6.3 3.4-8.4.2 2.8 1.4 4.6 2.6 6.2.9 1.2 1.5 2.6 1.5 4.3A5.5 5.5 0 0 1 12 21z" />
    </Line>
  );
}

export function VitalsIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M12 21v-9.5M12 11.5c0-3.6 2.6-6 6.5-6 0 3.6-2.6 6-6.5 6zM12 14.5c0-3-2.2-5-5.5-5 0 3 2.2 5 5.5 5z" />
    </Line>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M12 5v14M5 12h14" />
    </Line>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M14.5 5.5 8 12l6.5 6.5" />
    </Line>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="m5.5 12.5 4 4 9-9" />
    </Line>
  );
}

export function ScaleIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5zM9 9.5a4.2 4.2 0 0 1 6 0M12 11l1.2-1.6" />
    </Line>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M12 15V3.5M7.5 8 12 3.5 16.5 8M8 11H6.5A1.5 1.5 0 0 0 5 12.5v7A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16" />
    </Line>
  );
}

export function DietIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M3.5 12h17a8.5 8.5 0 0 1-17 0zM9 8.5c0-1.5 1-2 1-3.5M13.5 8.5c0-1.5 1-2 1-3.5" />
    </Line>
  );
}

export function WaterIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M5.5 4h13l-1.6 15.2a1.5 1.5 0 0 1-1.5 1.3H8.6a1.5 1.5 0 0 1-1.5-1.3zM6.4 9.5c2.4-1 4.2 1 5.6 0s3.2-1 5.6 0" />
    </Line>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M20.5 11.5a8 8 0 0 1-11.7 7.1L4 20l1.4-4.6A8 8 0 1 1 20.5 11.5z" />
    </Line>
  );
}

export function RunIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Circle cx={14.5} cy={4.5} r={1.8} />
      <Path d="m7 21 3.2-5.2 3.3 2.2V21M6 11l3-3.5 4.5 1 2 3.5 3 .5M10.2 15.8 12.5 9" />
    </Line>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="m6 6 12 12M18 6 6 18" />
    </Line>
  );
}

export function GalleryIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5zM3.5 16l5-5 4 4 2.5-2.5 5.5 5.5" />
      <Circle cx={15.5} cy={8.5} r={1.5} />
    </Line>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M12 19V5M6 11l6-6 6 6" />
    </Line>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M9.5 5.5 16 12l-6.5 6.5" />
    </Line>
  );
}

/** Meal history: the counter-clockwise history arrow around a fork and knife. */
export function HistoryIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5M3.5 4v4.5H8" />
      <Path d="M10 8.5v3c0 .9.6 1.5 1.3 1.5M12.6 8.5v3c0 .9-.6 1.5-1.3 1.5v3.5M15.5 8.5c-.9.5-1.3 1.6-1.3 3.3h1.3v4.2" />
    </Line>
  );
}
