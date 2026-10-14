package expo.modules.pdfrenderer

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

class PdfLockedException : CodedException("ERR_PDF_LOCKED", "This PDF is password protected", null)
class PdfUnreadableException(cause: Throwable?) :
  CodedException("ERR_PDF_UNREADABLE", "This PDF could not be opened", cause)

class RenderedPage : Record {
  @Field var uri: String = ""
  @Field var width: Int = 0
  @Field var height: Int = 0
}

// Renders PDF pages to JPEG files on device (Android PdfRenderer), so the backend only ever sees images.
// PdfRenderer allows one open page at a time; pages are rendered sequentially and bitmaps recycled.
class PdfRendererModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("PdfRenderer")

    AsyncFunction("getPageCount") { uri: String ->
      withRenderer(uri) { it.pageCount }
    }

    AsyncFunction("renderPage") { uri: String, pageIndex: Int, maxLongSide: Int, quality: Int ->
      withRenderer(uri) { renderer ->
        if (pageIndex < 0 || pageIndex >= renderer.pageCount) {
          throw CodedException("ERR_PDF_PAGE", "Page $pageIndex is out of range", null)
        }
        renderer.openPage(pageIndex).use { page ->
          val scale = maxLongSide.toFloat() / maxOf(page.width, page.height)
          val width = (page.width * scale).toInt().coerceAtLeast(1)
          val height = (page.height * scale).toInt().coerceAtLeast(1)
          val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
          try {
            // Pages render transparent; JPEG needs an opaque white page underneath.
            bitmap.eraseColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            val dir = File(context.cacheDir, "pdf-pages").apply { mkdirs() }
            val file = File(dir, "${UUID.randomUUID()}-p${pageIndex + 1}.jpg")
            FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.JPEG, quality.coerceIn(1, 100), it) }
            RenderedPage().apply {
              this.uri = Uri.fromFile(file).toString()
              this.width = width
              this.height = height
            }
          } finally {
            bitmap.recycle()
          }
        }
      }
    }
  }

  private fun <T> withRenderer(uri: String, block: (PdfRenderer) -> T): T {
    val descriptor = openDescriptor(uri)
    val renderer = try {
      PdfRenderer(descriptor)
    } catch (e: SecurityException) {
      descriptor.close()
      throw PdfLockedException()
    } catch (e: Exception) {
      descriptor.close()
      throw PdfUnreadableException(e)
    }
    return renderer.use(block)
  }

  private fun openDescriptor(uri: String): ParcelFileDescriptor {
    val parsed = Uri.parse(uri)
    return try {
      if (parsed.scheme == "content") {
        context.contentResolver.openFileDescriptor(parsed, "r")
          ?: throw PdfUnreadableException(null)
      } else {
        ParcelFileDescriptor.open(File(parsed.path ?: uri), ParcelFileDescriptor.MODE_READ_ONLY)
      }
    } catch (e: CodedException) {
      throw e
    } catch (e: Exception) {
      throw PdfUnreadableException(e)
    }
  }
}
