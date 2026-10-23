import { useMMKVString } from 'react-native-mmkv';

import { Row } from '@/dev/ui';
import { kv } from '@/lib/kv';
import { VITALS_TRACE_KEY } from '@/today/today-scores';

/** Read-only: the Vitals model as Today last computed it (areas, signals, bands, headline). */
export function VitalsRow() {
  const [raw] = useMMKVString(VITALS_TRACE_KEY, kv);
  let lines: string[] = ['No trace yet: open Today first.'];
  if (raw) {
    const t = JSON.parse(raw);
    lines = [
      `score ${t.score.value}${t.score.dataBacked ? '' : ' (prior)'} · confidence ${t.confidence}`,
      ...t.areas.map(
        (a: { key: string; score: number; state: string; source: string; signals: string[] }) =>
          `${a.key} ${a.score} ${a.state} (${a.source}): ${a.signals.join(', ') || 'prior'}`,
      ),
      `bands: ${t.bands.join(', ')}`,
      `headline: ${t.headline.headline} / ${t.headline.line}`,
    ];
  }
  return <Row title="Vitals model trace" status={lines.join('\n')} />;
}
