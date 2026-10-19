import { NativeModule, requireOptionalNativeModule } from 'expo';

/** One flag the overlay may show, with the time it starts and stops applying. */
export type OverlayFlag = {
  id: string;
  title: string;
  line: string;
  actionLabel: string | null;
  /** Done in place and queued for the app (e.g. `{ kind: 'water', ml: 250 }`). */
  quick: Record<string, unknown> | null;
  /** Opened in Halo instead (e.g. `haloapp://log?note=…`). */
  url: string | null;
  /** Epoch ms. */
  at: number;
  expiresAt: number;
  critical: boolean;
  /** What needs the user: the ring alternates between the score and this icon. Null = still. */
  icon: OverlayIcon | null;
};

export type OverlayIcon = 'meal' | 'water' | 'sleep' | 'vitals' | 'weight' | 'activity' | 'report';

/** What Halo hands the overlay; it keeps the last one for when Halo isn't running. */
export type OverlaySnapshot = {
  v: 1;
  /** Epoch ms when it was written. */
  at: number;
  scores: { overall: number; diet: number; activity: number; vitals: number };
  /** Hex colors of the current theme and mode. */
  colors: {
    bg: string;
    surface: string;
    text: string;
    muted: string;
    accent: string;
    alert: string;
  };
  flags: OverlayFlag[];
  /** Where Open app goes. */
  openUrl: string;
};

/** Something logged on the overlay, waiting for the app to put it in the store. */
export type OverlayQueued = { clientId: string; at: number; briefId?: string } & (
  { kind: 'meal_text'; text: string } | { kind: 'water'; ml: number } | { kind: 'acted' }
);

type Events = { onQueued: () => void };

declare class OverlayModule extends NativeModule<Events> {
  /** Whether "Display over other apps" is allowed. */
  canDraw(): boolean;
  /** Opens Halo's "Display over other apps" page. */
  openSettings(): void;
  /** Brings the overlay back (also after it was dragged away). False without the permission. */
  start(): boolean;
  /** Turns it off until start() (also across a restart). */
  stop(): void;
  isRunning(): boolean;
  setSnapshot(json: string): void;
  /** Chunk 27a spike: the next ring tap records 4 s and plays it back. Missing before the rebuild. */
  armVoiceSpike(mode: 'fgs' | 'activity'): void;
  voiceSpikeResult(): string;
  /** Everything logged on the overlay since the last call (a JSON array string). */
  takeQueue(): string;
}

/** Null on a build without the module (before the rebuild that adds it). */
export default requireOptionalNativeModule<OverlayModule>('Overlay');
