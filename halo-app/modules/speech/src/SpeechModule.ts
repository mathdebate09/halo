import { NativeModule, requireOptionalNativeModule } from 'expo';

export type SpeechError =
  'no_speech' | 'permission' | 'busy' | 'language' | 'client' | 'unavailable' | 'error';

type Events = {
  onStart: () => void;
  onPartial: (e: { text: string }) => void;
  onFinal: (e: { text: string }) => void;
  onLevel: (e: { db: number }) => void;
  onError: (e: { code: SpeechError }) => void;
  onEnd: () => void;
};

declare class SpeechModule extends NativeModule<Events> {
  /** Whether this phone can recognise speech on the device (Android 12+ with a recognizer). */
  isAvailable(): boolean;
  hasPermission(): boolean;
  requestPermission(): Promise<{ granted: boolean; canAskAgain?: boolean }>;
  /** Starts listening (a BCP-47 tag, or the phone's language). Results arrive as events. */
  start(language: string | null): Promise<void>;
  /** Stops listening; what was heard so far arrives as onFinal. */
  stop(): Promise<void>;
  cancel(): Promise<void>;
  /** Asks the system to fetch the offline speech pack (Android 13+); false where it can't. */
  downloadModel(language: string | null): Promise<boolean>;
}

/** Null on a build without the module (before the rebuild that adds it). */
export default requireOptionalNativeModule<SpeechModule>('Speech');
