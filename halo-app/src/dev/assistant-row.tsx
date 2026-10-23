import { useMMKVString } from 'react-native-mmkv';

import { TRACE_KEY } from '@/assistant/assistant';
import { Row } from '@/dev/ui';
import { kv } from '@/lib/kv';

/** Read-only: what the PA saw, set aside and ranked, and the brief it chose (latest Today pass). */
export function AssistantRow() {
  const [raw] = useMMKVString(TRACE_KEY, kv);
  let lines: string[] = ['No trace yet: open Today first.'];
  if (raw) {
    const t = JSON.parse(raw);
    lines = [
      `at ${t.at} · wake ${t.wake.value.toFixed(2)} (${t.wake.source}) · bed ${t.bedtime.hour.toFixed(2)}${t.bedtime.pulled ? ' pulled' : ''}`,
      `windows B ${t.windows.breakfast.start}-${t.windows.breakfast.end} L ${t.windows.lunch.start}-${t.windows.lunch.end} D ${t.windows.dinner.start}-${t.windows.dinner.end}`,
      `usual ${JSON.stringify(t.usualMeals)} · weigh due ${t.weighDue}`,
      `stored today: ${t.stored.join(', ') || 'none'}`,
      `signals: ${t.signals.join(', ') || 'none'}`,
      `set aside: ${t.dropped.join('; ') || 'none'}`,
      `ranked: ${t.ranked.join(', ') || 'none'}${t.held ? ' · held' : ''}`,
      `brief: ${t.brief.tagline} / ${t.brief.line}${t.brief.lead ? ` / lead: ${t.brief.lead}` : ''}`,
      `words: ${t.phrase}`,
    ];
  }
  return <Row title="Assistant (PA trace)" status={lines.join('\n')} />;
}
