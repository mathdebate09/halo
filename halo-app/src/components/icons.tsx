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
