// A picked report (one PDF, or photos of the pages) turned into what each page sends: its text
// layer when it has a usable one (scrubbed of names and IDs before it leaves the phone), otherwise
// two overlapping JPEG tiles. Pages with text but nothing like a result are skipped. Tiles live
// in the app cache; the caller deletes them once the page is read.

import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { hasResults, REPORT_LIMITS, scrubReportText, usableTextLayer } from '@/shared';

import PdfRenderer from '../../modules/pdf-renderer/src/PdfRendererModule';

export type ReportSource =
  { kind: 'pdf'; uri: string; password?: string | null } | { kind: 'images'; uris: string[] };

export type PreparedPage =
  { kind: 'text'; text: string } | { kind: 'tiles'; uris: string[] } | { kind: 'skip' };

const {
  renderLongSide,
  tiles: TILES,
  tileOverlap,
  jpegQuality,
  maxTileBytes,
  maxTextChars,
} = REPORT_LIMITS;

/** Whether a locked PDF can be opened with its password here (Android 15+). */
export const canUnlockPdf = PdfRenderer.supportsPassword;

export async function pageCount(source: ReportSource): Promise<number> {
  return source.kind === 'pdf'
    ? PdfRenderer.getPageCount(source.uri, source.password)
    : source.uris.length;
}

/** Same file(s), same hash: catches a report added twice. */
export async function sourceHash(source: ReportSource): Promise<string> {
  if (source.kind === 'pdf') return PdfRenderer.sha256(source.uri);
  const hashes = await Promise.all(source.uris.map((uri) => PdfRenderer.sha256(uri)));
  return hashes.length === 1
    ? hashes[0]!
    : digestStringAsync(CryptoDigestAlgorithm.SHA256, hashes.join(':'));
}

/** Page `index` (0-based) as text, tiles or nothing to read. */
export async function preparePage(source: ReportSource, index: number): Promise<PreparedPage> {
  if (source.kind === 'images')
    return { kind: 'tiles', uris: await imageTiles(source.uris[index]!) };
  const raw = await PdfRenderer.getPageText(source.uri, index, source.password);
  if (raw && usableTextLayer(raw)) {
    const text = scrubReportText(raw).slice(0, maxTextChars);
    return hasResults(text) ? { kind: 'text', text } : { kind: 'skip' };
  }
  const rendered = await PdfRenderer.renderTiles(
    source.uri,
    index,
    renderLongSide,
    jpegQuality,
    TILES,
    tileOverlap,
    source.password,
  );
  return { kind: 'tiles', uris: await Promise.all(rendered.map((t) => underCap(t.uri))) };
}

/**
 * A photo as tiles: EXIF rotation applied, the long side brought down to the render size, then
 * cut into overlapping bands like a rendered page.
 */
async function imageTiles(uri: string): Promise<string[]> {
  const probe = await ImageManipulator.manipulate(uri).renderAsync();
  const scale = Math.min(1, renderLongSide / Math.max(probe.width, probe.height));
  const width = Math.floor(probe.width * scale);
  const height = Math.floor(probe.height * scale);
  probe.release();
  const band = height / TILES;
  const pad = Math.round(height * tileOverlap);
  const out: string[] = [];
  for (let i = 0; i < TILES; i++) {
    const top = Math.max(0, Math.round(band * i - pad));
    const bottom = Math.min(height, Math.round(band * (i + 1) + pad));
    const image = await ImageManipulator.manipulate(uri)
      .resize({ width, height })
      .crop({ originX: 0, originY: top, width, height: bottom - top })
      .renderAsync();
    const saved = await image.saveAsync({ compress: jpegQuality / 100, format: SaveFormat.JPEG });
    image.release();
    out.push(await underCap(saved.uri));
  }
  return out;
}

/** A busy photo can come out large; re-save it softer until it fits the upload cap. */
async function underCap(uri: string): Promise<string> {
  let current = uri;
  for (const compress of [0.65, 0.5]) {
    if ((new File(current).size ?? 0) <= maxTileBytes) return current;
    const image = await ImageManipulator.manipulate(current).renderAsync();
    const saved = await image.saveAsync({ compress, format: SaveFormat.JPEG });
    image.release();
    discard([current]);
    current = saved.uri;
  }
  return current;
}

export async function tilesBase64(uris: readonly string[]): Promise<string[]> {
  return Promise.all(uris.map((uri) => new File(uri).base64()));
}

/** Deletes cached files (tiles, a picked copy); missing ones are fine. */
export function discard(uris: readonly string[]) {
  for (const uri of uris) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Already gone.
    }
  }
}
