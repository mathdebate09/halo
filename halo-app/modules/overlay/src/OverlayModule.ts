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
  | {
      kind: 'meal_text';
      text: string;
      mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null;
    }
  | { kind: 'water'; ml: number }
  | { kind: 'weight'; kg: number }
  | { kind: 'acted' }
  /** Takes back an earlier entry (by its client id): a voice reply's Undo. */
  | { kind: 'undo'; targetId: string }
  /** A voice exchange for today's Advisor thread; `logs` are the client ids it wrote. */
  | {
      kind: 'voice_turn';
      turnId: string;
      threadId: string;
      heard: string;
      reply: string;
      logs: { clientId: string; kind: 'meal_text' | 'water' | 'weight' }[];
    }
);

/** What the ring needs for a voice turn while Halo's JS may not be running. */
export type OverlayVoice = {
  v: 1;
  /** The user agreed (onboarding or the Today ask) and the mic is allowed. */
  allowed: boolean;
  api: { url: string; headers: Record<string, string> };
  /** Today's Advisor thread, and the snapshot the turn carries (null before a plan exists). */
  threadId: string;
  context: unknown | null;
  history: { role: 'user' | 'assistant'; content: string }[];
  /** Epoch ms when it was written (the ring sends no snapshot from an earlier day). */
  at: number;
};

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
  /** What a voice turn needs (an OverlayVoice as JSON). Missing before the 27d rebuild. */
  setVoice(json: string): void;
  /** Chunk 27a spike: the next ring tap records 4 s and plays it back. Missing before the rebuild. */
  armVoiceSpike(mode: 'fgs' | 'activity'): void;
  voiceSpikeResult(): string;
  /** Everything logged on the overlay since the last call (a JSON array string). */
  takeQueue(): string;
}

/** Null on a build without the module (before the rebuild that adds it). */
export default requireOptionalNativeModule<OverlayModule>('Overlay');
