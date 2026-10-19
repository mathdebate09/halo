// What the ring needs for a voice turn (chunk 27d), handed to the native side so a turn works while
// Halo's JS isn't running: the consent, the backend and its headers, today's Advisor thread with its
// last few messages, and the same snapshot the Advisor sends. Rebuilt on the overlay publisher's
// trigger and written only when it changed.

import { and, asc, eq, isNull } from 'drizzle-orm';
import { useEffect, useRef } from 'react';

import { buildAdvisorContext } from '@/advisor/context';
import { readAdvisorSources } from '@/advisor/sources';
import { usageAccess } from '@/assistant/screen';
import { db } from '@/db/client';
import { advisorMessages } from '@/db/schema';
import { healthConnectState } from '@/lib/health-connect';
import { dayKey, trimHistory, VOICE_LIMITS } from '@/shared';
import { API_URL, apiHeaders } from '@/sync/api';

import { useVoiceAccess, voiceBuilt } from './access';

import Overlay, { type OverlayVoice } from '../../modules/overlay/src/OverlayModule';

/** Today's thread, words only, as the Advisor would send it. */
function history(threadId: string): OverlayVoice['history'] {
  const rows = db
    .select({ role: advisorMessages.role, content: advisorMessages.content })
    .from(advisorMessages)
    .where(
      and(
        eq(advisorMessages.threadId, threadId),
        eq(advisorMessages.status, 'done'),
        isNull(advisorMessages.deletedAt),
      ),
    )
    .orderBy(asc(advisorMessages.createdAt))
    .all()
    .filter((m) => m.content.trim().length > 0);
  return trimHistory(rows, VOICE_LIMITS.history);
}

async function build(allowed: boolean): Promise<Omit<OverlayVoice, 'at'>> {
  const sources = readAdvisorSources();
  const connected = {
    healthConnect: (await healthConnectState()) === 'connected',
    screenTime: usageAccess() === 'granted',
  };
  const context = sources ? buildAdvisorContext(sources, connected) : null;
  const threadId = dayKey(new Date());
  return {
    v: 1,
    allowed,
    api: { url: API_URL, headers: apiHeaders() },
    threadId,
    context,
    history: history(threadId),
  };
}

/** Keeps the ring's voice payload current; `trigger` is the overlay publisher's change key. */
export function useVoicePublisher(trigger: string) {
  const access = useVoiceAccess();
  const written = useRef<string | null>(null);
  useEffect(() => {
    if (!voiceBuilt() || access == null) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const voice = await build(access === 'allowed');
      if (cancelled) return;
      const json = JSON.stringify(voice);
      if (json === written.current) return;
      written.current = json;
      Overlay?.setVoice(JSON.stringify({ ...voice, at: Date.now() }));
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trigger, access]);
}
