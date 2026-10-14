import NetInfo from '@react-native-community/netinfo';
import * as BackgroundTask from 'expo-background-task';
import { BlurTargetView, BlurView } from 'expo-blur';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { getLocales } from 'expo-localization';
import { Asset, requestPermissionsAsync as requestMediaPermissions } from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { type ReactNode, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  SdkAvailabilityStatus,
  aggregateRecord,
  getSdkStatus,
  initialize,
  requestPermission,
} from 'react-native-health-connect';
import { createMMKV } from 'react-native-mmkv';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { and, count, desc, eq, isNull, sum } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { HeroBackdrop } from '@/components/hero-backdrop';
import { ThemedScreen } from '@/components/themed-screen';
import { useHaloTheme } from '@/theme/theme-provider';
import { db } from '@/db/client';
import { deleteRecord, upsertRecord } from '@/db/mutate';
import { outbox, water } from '@/db/schema';
import { getDevice } from '@/lib/device';
import { API_URL } from '@/sync/api';
import { useSyncStatus } from '@/sync/status';
import { runSync } from '@/sync/worker';
import { dayKey } from '@/shared';
import { themeIds, zones } from '@/theme/themes';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import PdfRenderer from '../../modules/pdf-renderer/src/PdfRendererModule';

// Hidden developer screen: one row per native module from the batch build, each with a manual
// probe. Kept for demo mode later; not part of the product UI.

const storage = createMMKV({ id: 'dev' });

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function errorText(e: unknown) {
  const err = e as { code?: string; message?: string };
  return `✕ ${err.code ? `${err.code}: ` : ''}${err.message ?? String(e)}`;
}

function Row({ title, status, children }: { title: string; status: string; children?: ReactNode }) {
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

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="rounded-pill bg-glass/10 px-4 py-2 active:bg-glass/20">
      <Text className="font-sans-medium text-[13px] text-text">{label}</Text>
    </Pressable>
  );
}

function SyncRow() {
  const sync = useSyncStatus();
  const { data: synced } = useLiveQuery(
    db.select({ n: count() }).from(water).where(eq(water.syncState, 'synced')),
  );
  const ago = sync.lastSyncAt
    ? `${Math.round((Date.now() - sync.lastSyncAt) / 1000)}s ago`
    : 'never';
  return (
    <Row
      title="Sync"
      status={[
        `${API_URL} · ${sync.state} · last ${ago}`,
        `last run pushed ${sync.lastPushed}, pulled ${sync.lastPulled} · ${synced[0]?.n ?? 0} water rows synced`,
        sync.lastError ? `error: ${sync.lastError}` : null,
      ]
        .filter(Boolean)
        .join('\n')}>
      <Btn label="Sync now" onPress={() => void runSync()} />
    </Row>
  );
}

function StoreRow() {
  const today = dayKey(new Date());
  const device = getDevice();
  const { data: pending } = useLiveQuery(db.select({ n: count() }).from(outbox));
  const { data: ops } = useLiveQuery(
    db
      .select({ entity: outbox.entity, op: outbox.op })
      .from(outbox)
      .orderBy(desc(outbox.seq))
      .limit(4),
  );
  const { data: todayWater } = useLiveQuery(
    db
      .select({ ml: sum(water.ml), n: count() })
      .from(water)
      .where(and(eq(water.day, today), isNull(water.deletedAt))),
    [today],
  );
  const last = () =>
    db
      .select({ id: water.id })
      .from(water)
      .where(and(eq(water.day, today), isNull(water.deletedAt)))
      .orderBy(desc(water.at))
      .get();

  return (
    <Row
      title="Local store (SQLite + outbox)"
      status={[
        `device ${device?.id.slice(0, 8) ?? '—'}… · app key ${process.env.EXPO_PUBLIC_APP_KEY ? '•'.repeat(4) + process.env.EXPO_PUBLIC_APP_KEY.slice(-4) : 'missing'}`,
        `today ${today}: ${todayWater[0]?.ml ?? 0} ml water in ${todayWater[0]?.n ?? 0} logs`,
        `outbox ${pending[0]?.n ?? 0} pending: ${ops.map((o) => `${o.op} ${o.entity}`).join(', ') || 'empty'}`,
      ].join('\n')}>
      <Btn
        label="+ 250 ml water"
        onPress={() => upsertRecord('water', { day: today, at: Date.now(), ml: 250 })}
      />
      <Btn
        label="Delete last water"
        onPress={() => {
          const row = last();
          if (row) deleteRecord('water', row.id);
        }}
      />
    </Row>
  );
}

function ThemesRow() {
  const { theme, target, setThemeId } = useHaloTheme();
  const [preview, setPreview] = useState(false);
  const { height } = useWindowDimensions();
  const next = () => setThemeId(themeIds[(themeIds.indexOf(target.id) + 1) % themeIds.length]);

  return (
    <Row
      title="Themes"
      status={`${target.id} · veil ${target.veil.alpha} · contrast ${target.contrast.tagline}/${target.contrast.body}`}>
      {themeIds.map((id) => (
        <Pressable
          key={id}
          onPress={() => setThemeId(id)}
          className={`rounded-pill px-3 py-1.5 ${id === target.id ? 'bg-accent' : 'bg-glass/10'}`}>
          <Text
            className={`font-sans-medium text-[13px] ${id === target.id ? 'text-on-accent' : 'text-text'}`}>
            {id}
          </Text>
        </Pressable>
      ))}
      <Btn label="Preview hero" onPress={() => setPreview(true)} />

      <Modal
        visible={preview}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPreview(false)}>
        <Pressable onPress={next} className="flex-1 bg-bg">
          <HeroBackdrop />
          <Text className="absolute left-6 top-12 font-sans text-[13px] text-text/80">
            {theme.id} · tap to cycle
          </Text>
          <Pressable
            onPress={() => setPreview(false)}
            className="absolute right-6 top-10 rounded-pill bg-glass/15 px-4 py-2">
            <Text className="font-sans-medium text-[13px] text-text">Close</Text>
          </Pressable>
          <Text
            style={{ top: height * 0.36 }}
            className="absolute inset-x-0 text-center font-serif text-[96px] leading-[104px] text-text">
            82
          </Text>
          <Text
            style={{ top: height * zones.tagline[0] }}
            className="absolute inset-x-0 text-center font-serif text-[46px] leading-[52px] text-text">
            Go get ’em
          </Text>
          <Text
            style={{ top: height * zones.body[0] }}
            className="absolute inset-x-8 text-center font-sans text-[17px] leading-[26px] text-text/90">
            Breakfast landed right on pace and your steps are ahead of yesterday. A protein-rich
            lunch keeps the momentum going.
          </Text>
          <View
            style={{ top: height * 0.86 }}
            className="absolute inset-x-6 flex-row justify-between">
            <Text className="font-sans-medium text-[13px] tracking-[2px] text-strength">
              THRIVING
            </Text>
            <Text className="font-sans-medium text-[13px] tracking-[2px] text-steady">STEADY</Text>
            <Text className="font-sans-medium text-[13px] tracking-[2px] text-opportunity">
              NEEDS CARE
            </Text>
          </View>
        </Pressable>
      </Modal>
    </Row>
  );
}

export default function DevScreen() {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<Record<string, string>>({});
  const set = (key: string, value: string) => setStatus((s) => ({ ...s, [key]: value }));
  const s = (key: string) => status[key] ?? '—';

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const [pdfPage, setPdfPage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const shotRef = useRef<View>(null);
  const blurTargetRef = useRef<View>(null);
  const lastCapture = useRef<string | null>(null);

  useSpeechRecognitionEvent('result', (e) => setTranscript(e.results[0]?.transcript ?? ''));
  useSpeechRecognitionEvent('error', (e) => set('speech', `✕ ${e.error}: ${e.message}`));

  const run = (key: string, fn: () => Promise<string>) => async () => {
    set(key, '…');
    try {
      set(key, await fn());
    } catch (e) {
      set(key, errorText(e));
    }
  };

  return (
    <ThemedScreen>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-32"
        contentContainerStyle={{ paddingTop: insets.top + 12 }}>
        <Text className="mb-4 font-serif text-[40px] text-text">Native modules</Text>

        <ThemesRow />
        <StoreRow />
        <SyncRow />

        <Row title="Fonts (embedded)" status="Serif, italic, sans and medium below">
          <Text className="font-serif text-[22px] text-text">Serif</Text>
          <Text className="font-serif-italic text-[22px] text-text">Italic</Text>
          <Text className="font-sans text-[18px] text-text">Sans</Text>
          <Text className="font-sans-medium text-[18px] text-text">Medium</Text>
        </Row>

        <Row title="MMKV" status={s('mmkv')}>
          <Btn
            label="Increment"
            onPress={() => {
              const next = (storage.getNumber('count') ?? 0) + 1;
              storage.set('count', next);
              set('mmkv', `count = ${storage.getNumber('count')}`);
            }}
          />
        </Row>

        <Row
          title="Camera"
          status={cameraPermission?.granted ? 'granted' : (cameraPermission?.status ?? '—')}>
          <Btn label="Request" onPress={requestCameraPermission} />
          <Btn
            label={showCamera ? 'Hide preview' : 'Show preview'}
            onPress={() => setShowCamera((v) => !v)}
          />
        </Row>
        {showCamera && cameraPermission?.granted ? (
          <View className="mb-3 h-56 overflow-hidden rounded-card">
            <BlurTargetView ref={blurTargetRef} style={StyleSheet.absoluteFill}>
              <CameraView facing="back" style={{ flex: 1 }} />
            </BlurTargetView>
            <BlurView
              blurTarget={blurTargetRef}
              blurMethod="dimezisBlurViewSdk31Plus"
              intensity={60}
              tint="dark"
              style={styles.blurBand}>
              <Text className="font-serif text-[28px] text-text">Meal Logger</Text>
            </BlurView>
          </View>
        ) : null}

        <Row title="Image picker + manipulator" status={s('picker')}>
          <Btn
            label="Pick + resize 1024"
            onPress={run('picker', async () => {
              const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
              });
              if (res.canceled) return 'cancelled';
              const ref = await ImageManipulator.manipulate(res.assets[0].uri)
                .resize({ width: 1024 })
                .renderAsync();
              const out = await ref.saveAsync({
                compress: 0.8,
                format: SaveFormat.JPEG,
              });
              return `${res.assets[0].width}×${res.assets[0].height} → ${out.width}×${out.height}`;
            })}
          />
        </Row>

        <Row title="PDF renderer (local module)" status={s('pdf')}>
          <Btn
            label="Pick PDF"
            onPress={run('pdf', async () => {
              const res = await DocumentPicker.getDocumentAsync({
                type: 'application/pdf',
                copyToCacheDirectory: true,
              });
              if (res.canceled) return 'cancelled';
              const uri = res.assets[0].uri;
              const count = await PdfRenderer.getPageCount(uri);
              const page = await PdfRenderer.renderPage(uri, 0, 1600, 80);
              setPdfPage(page.uri);
              return `${count} pages, page 1 → ${page.width}×${page.height}`;
            })}
          />
          <Btn
            label="Clear cache"
            onPress={run('pdf', async () => {
              const dir = new Directory(Paths.cache, 'pdf-pages');
              if (dir.exists) dir.delete();
              setPdfPage(null);
              return 'pdf-pages deleted';
            })}
          />
        </Row>
        {pdfPage ? (
          <Image source={{ uri: pdfPage }} contentFit="contain" style={styles.pdfPage} />
        ) : null}

        <View
          ref={shotRef}
          collapsable={false}
          className="mb-3 items-center rounded-card bg-surface p-5">
          <Svg width={180} height={70} viewBox="0 0 180 70">
            <Path
              d="M10 65 A80 80 0 0 1 170 65"
              stroke="rgb(241 239 233)"
              strokeOpacity={0.25}
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
            />
            <Path
              d="M10 65 A80 80 0 0 1 140 22"
              stroke="rgb(241 239 233)"
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
            />
          </Svg>
          <Text className="font-serif text-[36px] text-text">82</Text>
        </View>
        <Row title="SVG + view-shot + sharing + media library" status={s('shot')}>
          <Btn
            label="Capture"
            onPress={run('shot', async () => {
              lastCapture.current = await captureRef(shotRef, {
                format: 'png',
                quality: 1,
              });
              return `captured ${lastCapture.current.split('/').pop()}`;
            })}
          />
          <Btn
            label="Share"
            onPress={run('shot', async () => {
              if (!lastCapture.current) return 'capture first';
              await Sharing.shareAsync(lastCapture.current, {
                mimeType: 'image/png',
              });
              return 'share sheet closed';
            })}
          />
          <Btn
            label="Save to gallery"
            onPress={run('shot', async () => {
              if (!lastCapture.current) return 'capture first';
              const perm = await requestMediaPermissions(true);
              if (!perm.granted) return 'media permission denied';
              const asset = await Asset.create(lastCapture.current);
              return `saved ${asset.id}`;
            })}
          />
        </Row>

        <Row title="Notifications" status={s('notif')}>
          <Btn
            label="Notify in 5 s"
            onPress={run('notif', async () => {
              const perm = await Notifications.requestPermissionsAsync();
              if (!perm.granted) return 'permission denied';
              await Notifications.scheduleNotificationAsync({
                content: { title: 'Halo', body: 'Lunch is usually around 1.' },
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                  seconds: 5,
                },
              });
              return 'scheduled';
            })}
          />
        </Row>

        <Row title="Health Connect" status={s('hc')}>
          <Btn
            label="Status"
            onPress={run('hc', async () => {
              const sdk = await getSdkStatus();
              return sdk === SdkAvailabilityStatus.SDK_AVAILABLE
                ? 'available'
                : `unavailable (status ${sdk})`;
            })}
          />
          <Btn
            label="Steps today"
            onPress={run('hc', async () => {
              if (!(await initialize())) return 'init failed';
              const granted = await requestPermission([
                { accessType: 'read', recordType: 'Steps' },
              ]);
              if (!granted.length) return 'permission denied';
              const start = new Date();
              start.setHours(0, 0, 0, 0);
              const res = await aggregateRecord({
                recordType: 'Steps',
                timeRangeFilter: {
                  operator: 'between',
                  startTime: start.toISOString(),
                  endTime: new Date().toISOString(),
                },
              });
              return `${res.COUNT_TOTAL} steps (${res.dataOrigins.join(', ') || 'no sources'})`;
            })}
          />
        </Row>

        <Row title="Speech recognition" status={transcript || s('speech')}>
          <Btn
            label="Listen"
            onPress={run('speech', async () => {
              if (!ExpoSpeechRecognitionModule.isRecognitionAvailable())
                return 'not available on this device';
              const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
              if (!perm.granted) return 'permission denied';
              setTranscript('');
              ExpoSpeechRecognitionModule.start({
                lang: 'en-US',
                interimResults: true,
              });
              return 'listening…';
            })}
          />
          <Btn label="Stop" onPress={() => ExpoSpeechRecognitionModule.stop()} />
        </Row>

        <Row title="System" status={s('system')}>
          <Btn
            label="Read"
            onPress={run('system', async () => {
              const net = await NetInfo.fetch();
              const locale = getLocales()[0];
              const bg = await BackgroundTask.getStatusAsync();
              return [
                `net: ${net.type}, connected ${net.isConnected}`,
                `locale: ${locale?.languageTag}, ${locale?.measurementSystem}`,
                `background task: ${BackgroundTask.BackgroundTaskStatus[bg]}`,
              ].join('\n');
            })}
          />
        </Row>
      </ScrollView>
    </ThemedScreen>
  );
}

// Third-party views (expo-image, expo-blur) don't take className without cssInterop.
const styles = StyleSheet.create({
  blurBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfPage: {
    height: 320,
    marginBottom: 12,
    borderRadius: 28,
    backgroundColor: 'white',
  },
});
