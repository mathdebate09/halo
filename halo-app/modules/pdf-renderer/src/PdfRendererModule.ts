import { NativeModule, requireNativeModule } from 'expo';

export type RenderedPage = {
  /** file:// URI of the JPEG in the app cache (caller deletes it when done). */
  uri: string;
  width: number;
  height: number;
};

declare class PdfRendererModule extends NativeModule<{}> {
  /** The text layer and passwords need Android 15 (API 35). */
  readonly supportsText: boolean;
  readonly supportsPassword: boolean;
  /**
   * Rejects with ERR_PDF_LOCKED for password-protected files (or a wrong password),
   * ERR_PDF_UNREADABLE otherwise. `password` is only used where `supportsPassword`.
   */
  getPageCount(uri: string, password?: string | null): Promise<number>;
  renderPage(
    uri: string,
    pageIndex: number,
    maxLongSide: number,
    quality: number,
    password?: string | null,
  ): Promise<RenderedPage>;
  /** The page as `tiles` horizontal bands, top to bottom, overlapping by `overlap` of its height. */
  renderTiles(
    uri: string,
    pageIndex: number,
    maxLongSide: number,
    quality: number,
    tiles: number,
    overlap: number,
    password?: string | null,
  ): Promise<RenderedPage[]>;
  /** The page's text, one visual line per line; null where the text layer can't be read. */
  getPageText(uri: string, pageIndex: number, password?: string | null): Promise<string | null>;
  /** SHA-256 of the file, hex. */
  sha256(uri: string): Promise<string>;
}

export default requireNativeModule<PdfRendererModule>('PdfRenderer');
