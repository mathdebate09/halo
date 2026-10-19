// What the floating overlay shows (chunk 24e), handed to it as one snapshot: today's scores, the
// theme's colors, and every flag the PA has for the rest of the day, each with the time it starts
// and stops applying. The flags are the same decisions as Today and the notifications (the brief
// on screen, then planDay's moments in the tray's own words), so the overlay never decides
// anything; it shows the flag whose time has come, also while Halo is closed.

import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAssistant } from '@/assistant/assistant';
import { readDelivered, wordMoment } from '@/assistant/notify';
import { useBriefWords } from '@/assistant/phrasing';
import { type InsightKind, type NextAction, planDay } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';
import { useTodayScores } from '@/today/today-scores';

import { useVoicePublisher } from '@/voice/publish';

import { useOverlayDrain } from './drain';

import Overlay, {
  type OverlayFlag,
  type OverlayIcon,
  type OverlaySnapshot,
} from '../../modules/overlay/src/OverlayModule';

/** What needs the user, as the ring's alternating icon. Kinds without one never flag. */
const ICON: Partial<Record<InsightKind, OverlayIcon>> = {
  meal_window: 'meal',
  protein_pace: 'meal',
  calorie_pace: 'meal',
  calorie_over: 'meal',
  water_pace: 'water',
  sleep_debt: 'sleep',
  bedtime: 'sleep',
  sleep_pattern: 'sleep',
  wake_ask: 'sleep',
  usage_ask: 'sleep',
  weigh_in: 'weight',
  vital_alert: 'vitals',
  blood_work: 'report',
};

/** Where Open app goes: the logger, for a photo or the mic. */
const OPEN_URL = 'haloapp://log';

/** The prepared step: water is done in place (queued); the rest open the screen that does it. */
function stepOf(action: NextAction): Pick<OverlayFlag, 'quick' | 'url'> {
  switch (action?.kind) {
    case 'water':
      return { quick: { kind: 'water', ml: action.ml }, url: null };
    case 'log':
      return {
        quick: null,
        url: action.note
          ? `haloapp://log?note=${encodeURIComponent(action.note)}`
          : 'haloapp://log',
      };
    case 'weigh':
      return { quick: null, url: 'haloapp://weigh-in' };
    case 'ask_wake':
      return { quick: null, url: 'haloapp://wake-time' };
    case 'advisor':
      return { quick: null, url: 'haloapp://advisor' };
    case 'blood_work':
      return { quick: null, url: 'haloapp://reports' };
    default:
      // Settings pages and Health Connect are asked from inside Halo, not from over another app.
      return { quick: null, url: null };
  }
}

function flag(
  insight: { id: string; type: InsightKind; action: NextAction; expiresAt: number },
  words: { title: string; line: string; actionLabel: string | null },
  at: number,
): OverlayFlag | null {
  const icon = ICON[insight.type];
  if (!icon) return null;
  const step = stepOf(insight.action);
  return {
    id: insight.id,
    title: words.title,
    line: words.line,
    actionLabel: step.quick || step.url ? words.actionLabel : null,
    ...step,
    at,
    expiresAt: insight.expiresAt,
    critical: insight.type === 'vital_alert',
    icon,
  };
}

type Sources = {
  scores: ReturnType<typeof useTodayScores>;
  brief: ReturnType<typeof useAssistant>['brief'];
  context: ReturnType<typeof useAssistant>['context'];
  words: ReturnType<typeof useBriefWords>;
  colors: ReturnType<typeof useHaloTheme>['theme']['colors'];
  tier: ReturnType<typeof useHaloTheme>['target']['tier'];
};

function build({
  scores,
  brief,
  context,
  words,
  colors: c,
  tier,
}: Sources): Omit<OverlaySnapshot, 'at'> {
  const flags: OverlayFlag[] = [];
  if (brief.insight.type !== 'on_track') {
    // The brief on screen already applies (start 0); a planned moment whose time comes later wins.
    const current = flag(
      brief.insight,
      { title: words.tagline, line: words.line, actionLabel: words.actionLabel },
      0,
    );
    if (current) flags.push(current);
  }
  // The rest of the day as the tray would get it, past the brief on screen.
  for (const m of planDay(context, readDelivered())) {
    if (flags.some((f) => f.id === m.insight.id)) continue;
    const { title, body } = wordMoment(m, tier, context.facts.goal);
    const next = flag(
      m.insight,
      { title, line: body, actionLabel: m.insight.copy.actionLabel },
      m.at,
    );
    if (next) flags.push(next);
  }
  return {
    v: 1,
    scores: {
      overall: Math.round(scores.overall),
      diet: Math.round(scores.diet.value),
      activity: Math.round(scores.activity.value),
      vitals: Math.round(scores.vitals.value),
    },
    colors: {
      bg: c.bg,
      surface: c.surface,
      text: c.text,
      muted: c.muted,
      accent: c.accent,
      alert: c.opportunity,
    },
    flags,
    openUrl: OPEN_URL,
  };
}

/**
 * Keeps the overlay's snapshot (and its voice payload) current, brings the overlay back on every open
 * of Halo, and puts what was logged on it into the store.
 */
export function OverlayPublisher() {
  useOverlayDrain();
  const scores = useTodayScores();
  const { brief, context, phrase } = useAssistant();
  const words = useBriefWords(brief, phrase);
  const { theme, target } = useHaloTheme();

  // The last snapshot written, and a bump that forces the next write.
  const [epoch, setEpoch] = useState(0);
  const written = useRef<string | null>(null);

  // Opening Halo (cold or from the background) brings back a ring that was dragged away.
  useEffect(() => {
    if (!Overlay) return;
    const bringBack = () => {
      if (Overlay?.canDraw()) Overlay.start();
    };
    bringBack();
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      bringBack();
      // Write afresh on every return, whatever the stored snapshot became meanwhile.
      written.current = null;
      setEpoch((e) => e + 1);
    });
    return () => sub.remove();
  }, []);

  // The snapshot is built a moment after anything it reads changes, from the latest values.
  const latest = useRef({ scores, brief, context, words, colors: theme.colors, tier: target.tier });
  latest.current = { scores, brief, context, words, colors: theme.colors, tier: target.tier };
  const c = theme.colors;
  const trigger = [
    brief.insight.id,
    words.tagline,
    words.line,
    Math.round(scores.overall),
    Math.round(scores.diet.value),
    Math.round(scores.activity.value),
    Math.round(scores.vitals.value),
    c.bg,
    c.text,
    context.facts.mealsLogged,
    context.facts.waterMl,
    context.lastLogAt,
    context.weighedToday,
    // The plan moves on with the clock too; a quarter hour is fine-grained enough.
    Math.floor(context.now / (15 * 60_000)),
    epoch,
  ].join('|');
  useEffect(() => {
    if (!Overlay) return;
    const timer = setTimeout(() => {
      const snapshot = build(latest.current);
      const json = JSON.stringify(snapshot);
      if (json === written.current) return;
      written.current = json;
      Overlay?.setSnapshot(JSON.stringify({ ...snapshot, at: Date.now() }));
    }, 1000);
    return () => clearTimeout(timer);
  }, [trigger]);
  // What the ring needs to talk, on the same beat.
  useVoicePublisher(trigger);

  return null;
}
