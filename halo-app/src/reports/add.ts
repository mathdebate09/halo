// Adding a report from Vitals' +: one system picker for a PDF, or photos of the pages (several
// photos are one report). The same file twice is caught by its hash; a locked PDF waits for its
// password in a sheet (Android 15+). Then the runner takes the file over.

import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';

import { showToast } from '@/components/toast';
import { REPORT_LIMITS } from '@/shared';

import { canUnlockPdf, discard, pageCount, type ReportSource, sourceHash } from './pages';
import { existingReport, startReport } from './runner';

/** A locked PDF waiting for its password (one at a time). */
let pending: { source: Extract<ReportSource, { kind: 'pdf' }>; hash: string } | null = null;

const errorCode = (e: unknown) => (e as { code?: string } | null)?.code;

function begin(source: ReportSource, hash: string, total: number) {
  startReport(source, hash, Math.min(total, REPORT_LIMITS.maxPages));
}

export async function addReport() {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (res.canceled) return;
  const uris = res.assets.map((a) => a.uri);
  const isPdf = (a: DocumentPicker.DocumentPickerAsset) =>
    a.mimeType === 'application/pdf' || a.name.toLowerCase().endsWith('.pdf');
  const pdfs = res.assets.filter(isPdf);
  if (pdfs.length > 1 || (pdfs.length === 1 && res.assets.length > 1)) {
    discard(uris);
    return showToast('Pick one PDF, or photos of the pages');
  }
  if (res.assets.some((a) => (a.size ?? 0) > REPORT_LIMITS.maxFileBytes)) {
    discard(uris);
    return showToast('This file is too large');
  }
  const source: ReportSource =
    pdfs.length === 1 ? { kind: 'pdf', uri: uris[0]! } : { kind: 'images', uris };
  try {
    const hash = await sourceHash(source);
    if (existingReport(hash)) {
      discard(uris);
      return showToast('This report is already added');
    }
    try {
      begin(source, hash, await pageCount(source));
    } catch (e) {
      if (errorCode(e) !== 'ERR_PDF_LOCKED' || source.kind !== 'pdf') throw e;
      if (!canUnlockPdf) {
        discard(uris);
        return showToast('This PDF is locked. Remove the password and try again.');
      }
      pending = { source, hash };
      router.push('/report-password');
    }
  } catch {
    discard(uris);
    showToast("This file couldn't be opened");
  }
}

/** The password sheet's answer: starts the report, or says the password didn't open it. */
export async function unlockPending(password: string): Promise<'ok' | 'wrong' | 'gone'> {
  if (!pending) return 'gone';
  const source = { ...pending.source, password };
  try {
    const total = await pageCount(source);
    begin(source, pending.hash, total);
    pending = null;
    return 'ok';
  } catch (e) {
    if (errorCode(e) === 'ERR_PDF_LOCKED') return 'wrong';
    cancelPending();
    return 'gone';
  }
}

/** The sheet closed without a password: the copy of the file goes. */
export function cancelPending() {
  if (pending) discard([pending.source.uri]);
  pending = null;
}
