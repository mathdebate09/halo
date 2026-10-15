import { NativeModule, requireOptionalNativeModule } from 'expo';

export type ScreenEvent = { at: number; on: boolean };

declare class ScreenTimeModule extends NativeModule<{}> {
  /** Whether the user has granted Usage access. */
  hasAccess(): boolean;
  /** Opens the Usage access settings (Halo's own page where the OS supports it). */
  openSettings(): void;
  /** Screen on/off events between two epoch-ms times, oldest first (Android keeps a few days). */
  screenEvents(from: number, to: number): Promise<ScreenEvent[]>;
}

/** Null on a build without the module (before the rebuild that adds it). */
export default requireOptionalNativeModule<ScreenTimeModule>('ScreenTime');
