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

// ── Learn more metrics ──────────────────────────────────────────────────────────

export function SummaryIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M4 6h10M4 11h10M4 16h7" />
      <Path d="m18 13.5.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />
    </Line>
  );
}

export function CaloriesIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.3 2.6-5 3.6-8.4 1.4 1.3 2 2.7 2 4.2 1-.6 1.6-1.6 1.8-2.8 2 1.6 4.6 4 4.6 7C18 18.6 15.6 21 12 21z" />
      <Path d="M12 21c-1.5 0-2.6-1-2.6-2.4 0-1.5 1.2-2.3 2.1-3.6.5.8 1 1.2 1.6 1.4.7.3 1.5 1 1.5 2.2 0 1.4-1.1 2.4-2.6 2.4z" />
    </Line>
  );
}

export function ProteinIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M16.4 4.6a4.6 4.6 0 0 1 0 6.6c-1.5 1.5-3.6 1.9-5.4 1.2l-2.8 2.8" />
      <Path d="M16.4 4.6a4.6 4.6 0 0 0-6.6 0c-1.5 1.5-1.9 3.6-1.2 5.4l-2.8 2.8" />
      <Path d="M5.8 12.8a1.6 1.6 0 1 0-1.5 2.7 1.6 1.6 0 1 0 2.7 1.5" />
      <Path d="M8.2 15.2 5.8 12.8M8.2 15.2 7 17" />
    </Line>
  );
}

export function FatIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M12 3.5c-2.2 0-3.4 2-3.9 4.4-.4 1.7-2.6 3.2-2.6 6.4a6.5 6.5 0 0 0 13 0c0-3.2-2.2-4.7-2.6-6.4C15.4 5.5 14.2 3.5 12 3.5z" />
      <Circle cx={12} cy={14.5} r={2.6} />
    </Line>
  );
}

export function CarbsIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M12 21V8" />
      <Path d="M12 8c0-2 1-3.5 2.5-4.5.4 1.9-.4 3.6-2.5 4.5zM12 8c0-2-1-3.5-2.5-4.5C9.1 5.4 9.9 7.1 12 8z" />
      <Path d="M12 13c1.2-1.6 2.8-2.4 4.6-2.4-.3 1.9-2 3-4.6 2.4zM12 13c-1.2-1.6-2.8-2.4-4.6-2.4.3 1.9 2 3 4.6 2.4zM12 17.5c1.2-1.6 2.8-2.4 4.6-2.4-.3 1.9-2 3-4.6 2.4zM12 17.5c-1.2-1.6-2.8-2.4-4.6-2.4.3 1.9 2 3 4.6 2.4z" />
    </Line>
  );
}

export function MealScoreIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M4.5 16a7.5 7.5 0 1 1 15 0M12 16l3.5-4.5" />
      <Circle cx={12} cy={16} r={1.2} />
    </Line>
  );
}

export function WaterDropIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M12 3.5c3 3.6 6 7.3 6 10.8A6 6 0 0 1 6 14.3c0-3.5 3-7.2 6-10.8z" />
      <Path d="M7.5 14.5c1.5-.9 3-.9 4.5 0s3 .9 4.5 0" />
    </Line>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M5.5 9.5 12 16l6.5-6.5" />
    </Line>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M4.5 6.5h15M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7M6.5 6.5l.9 12.6a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.6M10 10.5v6M14 10.5v6" />
    </Line>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M12 3.5V15M7 10.5l5 4.5 5-4.5M5 20h14" />
    </Line>
  );
}

/** Instagram's camera glyph: a rounded square, a lens and the flash dot. */
export function InstagramIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M8 3.5h8A4.5 4.5 0 0 1 20.5 8v8a4.5 4.5 0 0 1-4.5 4.5H8A4.5 4.5 0 0 1 3.5 16V8A4.5 4.5 0 0 1 8 3.5z" />
      <Circle cx={12} cy={12} r={3.8} />
      <Circle cx={17} cy={7} r={0.6} fill={props.color} />
    </Line>
  );
}

export function EyeIcon({ off = false, ...props }: IconProps & { off?: boolean }) {
  return (
    <Line {...props}>
      <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <Circle cx={12} cy={12} r={3} />
      {off ? <Path d="M4 4l16 16" /> : null}
    </Line>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M4.5 7.5h3l1.5-2.5h6l1.5 2.5h3A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V9a1.5 1.5 0 0 1 1.5-1.5z" />
      <Circle cx={12} cy={13.5} r={3.8} />
    </Line>
  );
}
