import { NativeModule, requireNativeModule } from 'expo';

export type RenderedPage = {
  /** file:// URI of the JPEG in the app cache (caller deletes it when done). */
  uri: string;
  width: number;
  height: number;
};

declare class PdfRendererModule extends NativeModule<{}> {
  /** Rejects with ERR_PDF_LOCKED for password-protected files, ERR_PDF_UNREADABLE otherwise. */
  getPageCount(uri: string): Promise<number>;
  renderPage(
    uri: string,
    pageIndex: number,
    maxLongSide: number,
    quality: number,
  ): Promise<RenderedPage>;
}

export default requireNativeModule<PdfRendererModule>('PdfRenderer');
