import NetInfo from '@react-native-community/netinfo';
import { desc } from 'drizzle-orm';
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
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  aggregateRecord,
  getSdkStatus,
  initialize,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';
import { createMMKV } from 'react-native-mmkv';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import PdfRenderer from '../../modules/pdf-renderer/src/PdfRendererModule';
import { db } from '@/db/client';
import { hcDaily } from '@/db/schema';
import { ReportReadRow } from '@/dev/report-read-row';
import { Btn, errorText, Row } from '@/dev/ui';
import { connectHealthConnect, refreshHealthData } from '@/lib/health-connect';

const storage = createMMKV({ id: 'dev' });

/**
 * One probe per native module from the batch build (camera, picker, PDF, view-shot, notifications,
 * Health Connect, system), each reporting into its own status line.
 */
export function ModuleProbes() {
  const [status, setStatus] = useState<Record<string, string>>({});
  const set = (key: string, value: string) => setStatus((s) => ({ ...s, [key]: value }));
  const s = (key: string) => status[key] ?? '—';

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const [pdfPage, setPdfPage] = useState<string | null>(null);
  const shotRef = useRef<View>(null);
  const blurTargetRef = useRef<View>(null);
  const lastCapture = useRef<string | null>(null);

  const run = (key: string, fn: () => Promise<string>) => async () => {
    set(key, '…');
    try {
      set(key, await fn());
    } catch (e) {
      set(key, errorText(e));
    }
  };

  return (
    <>
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
      <ReportReadRow />

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
            const granted = await requestPermission([{ accessType: 'read', recordType: 'Steps' }]);
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
        <Btn
          label="Ask all types"
          onPress={run('hc', async () => {
            const status = await connectHealthConnect();
            await refreshHealthData(true);
            return status;
          })}
        />
        <Btn
          label="Latest extras"
          onPress={run('hc', async () => {
            const rows = await db.select().from(hcDaily).orderBy(desc(hcDaily.day)).limit(14);
            const keys = [
              'respRate',
              'bodyTempC',
              'bodyFatPct',
              'vo2max',
              'weightKg',
              'hydrationMl',
              'nutritionKcal',
            ] as const;
            return keys
              .map((k) => {
                const r = rows.find((row) => row[k] != null);
                return `${k}: ${r ? `${r[k]} (${r.day})` : 'none'}`;
              })
              .join('\n');
          })}
        />
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
    </>
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
