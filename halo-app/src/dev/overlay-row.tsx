import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import Overlay, { type OverlaySnapshot } from '../../modules/overlay/src/OverlayModule';
import { Btn, Row } from '@/dev/ui';
import { useHaloTheme } from '@/theme/theme-provider';

/** The overlay on its own (24d checkpoint): permission, a fake snapshot in the theme's colors, the queue. */
export function OverlayRow() {
  const { theme } = useHaloTheme();
  const [note, setNote] = useState('');
  // Re-read the permission and the service on return from Settings.
  const [, setTick] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setTick((t) => t + 1));
    return () => sub.remove();
  }, []);
  if (!Overlay) return <Row title="Overlay" status="not in this build (rebuild)" />;
  const overlay = Overlay;
  const c = theme.colors;
  const now = Date.now();
  const fake: OverlaySnapshot = {
    v: 1,
    at: now,
    scores: { overall: 64, diet: 56, activity: 59, vitals: 72 },
    colors: {
      bg: c.bg,
      surface: c.surface,
      text: c.text,
      muted: c.muted,
      accent: c.accent,
      alert: c.opportunity,
    },
    flags: [
      {
        id: 'dev:water',
        title: 'Water break',
        line: 'About 400 ml behind for 21:00. A glass now helps.',
        actionLabel: 'Add a glass',
        quick: { kind: 'water', ml: 250 },
        url: null,
        at: now,
        expiresAt: now + 30 * 60_000,
        critical: false,
        icon: 'water',
      },
    ],
    openUrl: 'haloapp://log',
  };
  const status = [
    `may draw: ${overlay.canDraw() ? 'yes' : 'no'} · running: ${overlay.isRunning() ? 'yes' : 'no'}`,
    note,
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <Row title="Overlay" status={status}>
      <Btn label="Allow" onPress={() => overlay.openSettings()} />
      <Btn
        label="Fake + start"
        onPress={() => {
          overlay.setSnapshot(JSON.stringify(fake));
          setNote(overlay.start() ? 'started' : 'not allowed');
        }}
      />
      <Btn
        label="Fake, nothing due"
        onPress={() => {
          overlay.setSnapshot(JSON.stringify({ ...fake, flags: [] }));
          setNote(overlay.start() ? 'started, nothing due' : 'not allowed');
        }}
      />
      <Btn
        label="Stop"
        onPress={() => {
          overlay.stop();
          setTick((t) => t + 1);
        }}
      />
      <Btn label="Read queue" onPress={() => setNote(`queue: ${overlay.takeQueue()}`)} />
    </Row>
  );
}
