import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Text, TextInput } from 'react-native';

import PdfRenderer from '../../modules/pdf-renderer/src/PdfRendererModule';
import { Btn, errorText, Row } from '@/dev/ui';
import {
  discard,
  pageCount,
  preparePage,
  type ReportSource,
  sourceHash,
  tilesBase64,
} from '@/reports/pages';
import { type JobView, mergeReport, type ReportPage, reportPageSchema, tidyPage } from '@/shared';
import { api } from '@/sync/api';

/**
 * The whole report read without the app's flow (validation): pick a PDF or photos, prepare
 * each page (text layer or tiles), read the pages on the backend (≤4 at once), merge them, and
 * show what came back next to the first page's text.
 */
export function ReportReadRow() {
  const [status, setStatus] = useState('—');
  const [password, setPassword] = useState('');
  const [out, setOut] = useState<string | null>(null);

  const readPage = async (
    key: string,
    page: number,
    of: number,
    body: { text?: string; tiles?: string[] },
  ) => {
    const job = await api<JobView>('/reports/pages', {
      method: 'POST',
      body: { key, page, of, ...body },
      timeoutMs: 30_000,
    });
    for (let view = job; ;) {
      // Scrubbed and tidied again here: the phone doesn't take the server's word for it.
      if (view.status === 'done') return tidyPage(reportPageSchema.parse(view.result));
      if (view.status === 'failed') throw new Error(`page ${page}: ${view.error ?? 'failed'}`);
      await new Promise((r) => setTimeout(r, 1500));
      view = await api<JobView>(`/jobs/${job.id}`);
    }
  };

  const read = async (pick: 'pdf' | 'images') => {
    setOut(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: pick === 'pdf' ? 'application/pdf' : 'image/*',
      multiple: pick === 'images',
      copyToCacheDirectory: true,
    });
    if (res.canceled) return setStatus('cancelled');
    const source: ReportSource =
      pick === 'pdf'
        ? { kind: 'pdf', uri: res.assets[0]!.uri, password: password || null }
        : { kind: 'images', uris: res.assets.map((a) => a.uri) };
    const started = Date.now();
    try {
      const hash = await sourceHash(source);
      const of = await pageCount(source);
      const reportId = randomUUID();
      const kinds: string[] = [];
      // What the module returns for page 1, before scrubbing (validation only, never sent).
      const firstText: string | null =
        source.kind === 'pdf'
          ? await PdfRenderer.getPageText(source.uri, 0, source.password)
          : null;
      const pages: (ReportPage | null)[] = Array.from({ length: of }, () => null);
      let next = 0;
      let done = 0;
      const worker = async () => {
        while (next < of) {
          const i = next++;
          const prepared = await preparePage(source, i);
          kinds[i] = prepared.kind;
          if (prepared.kind === 'skip') continue;
          const body =
            prepared.kind === 'text'
              ? { text: prepared.text }
              : { tiles: await tilesBase64(prepared.uris) };
          try {
            pages[i] = await readPage(`${reportId}:p${i + 1}`, i + 1, of, body);
          } finally {
            if (prepared.kind === 'tiles') discard(prepared.uris);
          }
          setStatus(`reading… ${++done} of ${of}`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, of) }, worker));
      const merged = mergeReport(pages.filter((p): p is ReportPage => p != null));
      const count = (k: string) => kinds.filter((x) => x === k).length;
      setStatus(
        `${of} pages (${count('text')} text, ${count('tiles')} tiles, ${count('skip')} skipped) · ` +
          `${merged.values.length} values · ${merged.reportDate ?? 'no date'} · ${((Date.now() - started) / 1000).toFixed(1)} s · ${hash.slice(0, 10)}`,
      );
      setOut(
        merged.values
          .map(
            (v) =>
              `${v.include ? '' : '× '}${v.label} ${v.value}${v.qualifier ? ` (${v.qualifier})` : ''} ${v.unit ?? ''}` +
              ` [${v.refLo ?? ''}–${v.refHi ?? ''}] ${v.flag ?? ''} ${v.date ?? ''} ${v.metric}${v.conflict ? ' CONFLICT' : ''} · ${v.raw}`,
          )
          .join('\n') +
          (firstText
            ? `\n\n── page 1 text layer, unscrubbed (local only) ──\n${firstText.slice(0, 1500)}`
            : ''),
      );
    } catch (e) {
      setStatus(errorText(e));
    } finally {
      discard(res.assets.map((a) => a.uri));
    }
  };

  return (
    <>
      <Row title="Read a report" status={status}>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="PDF password"
          placeholderTextColor="rgba(241,239,233,0.4)"
          secureTextEntry
          className="min-w-[140px] rounded-pill bg-glass/10 px-4 py-2 font-sans text-[13px] text-text"
        />
        <Btn label="PDF" onPress={() => void read('pdf')} />
        <Btn label="Photos" onPress={() => void read('images')} />
      </Row>
      {out ? (
        <Text selectable className="mb-3 font-mono text-[10px] leading-[14px] text-text">
          {out}
        </Text>
      ) : null}
    </>
  );
}
