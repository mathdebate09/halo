package expo.modules.pdfrenderer

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.LoadParams
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.security.MessageDigest
import java.util.UUID
import kotlin.math.roundToInt

class PdfLockedException : CodedException("ERR_PDF_LOCKED", "This PDF is password protected", null)
class PdfUnreadableException(cause: Throwable?) :
  CodedException("ERR_PDF_UNREADABLE", "This PDF could not be opened", cause)

class RenderedPage : Record {
  @Field var uri: String = ""
  @Field var width: Int = 0
  @Field var height: Int = 0
}

// Reads PDF pages on device (Android PdfRenderer), so the backend never sees the file: pages
// rendered to JPEG (whole, or as overlapping tiles), the page's text layer (Android 15+), and a
// hash of the file. PdfRenderer allows one open page at a time; bitmaps are recycled.
class PdfRendererModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  /** Text layer and passwords need Android 15 (API 35). */
  private val modern = Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM

  override fun definition() = ModuleDefinition {
    Name("PdfRenderer")

    Constant("supportsText") { modern }
    Constant("supportsPassword") { modern }

    AsyncFunction("getPageCount") { uri: String, password: String? ->
      withRenderer(uri, password) { it.pageCount }
    }

    AsyncFunction("renderPage") { uri: String, pageIndex: Int, maxLongSide: Int, quality: Int, password: String? ->
      withRenderer(uri, password) { renderer ->
        val bitmap = renderBitmap(renderer, pageIndex, maxLongSide)
        try {
          save(bitmap, pageIndex, "", quality)
        } finally {
          bitmap.recycle()
        }
      }
    }

    // The page as `tiles` horizontal bands (top to bottom), each overlapping the next by `overlap`
    // of the page height, so a table row on a cut is whole in one of them.
    AsyncFunction("renderTiles") {
      uri: String, pageIndex: Int, maxLongSide: Int, quality: Int, tiles: Int, overlap: Double, password: String? ->
      withRenderer(uri, password) { renderer ->
        val bitmap = renderBitmap(renderer, pageIndex, maxLongSide)
        try {
          val n = tiles.coerceIn(1, 4)
          val pad = (bitmap.height * overlap.coerceIn(0.0, 0.3)).roundToInt()
          val band = bitmap.height.toDouble() / n
          (0 until n).map { i ->
            val top = (band * i - pad).roundToInt().coerceAtLeast(0)
            val bottom = (band * (i + 1) + pad).roundToInt().coerceAtMost(bitmap.height)
            val tile = Bitmap.createBitmap(bitmap, 0, top, bitmap.width, bottom - top)
            try {
              save(tile, pageIndex, "-t${i + 1}", quality)
            } finally {
              if (tile !== bitmap) tile.recycle()
            }
          }
        } finally {
          bitmap.recycle()
        }
      }
    }

    // The page's text in reading order, one visual line per line (a table row's cells together),
    // or null when the text layer can't be read on this Android version.
    AsyncFunction("getPageText") { uri: String, pageIndex: Int, password: String? ->
      if (!modern) return@AsyncFunction null
      withRenderer(uri, password) { renderer ->
        checkPage(renderer, pageIndex)
        renderer.openPage(pageIndex).use { page ->
          page.textContents.joinToString("\n") { it.text.replace(Regex("\r\n|\r"), "\n") }
        }
      }
    }

    // SHA-256 of the file (hex), to catch the same report picked twice.
    AsyncFunction("sha256") { uri: String ->
      val digest = MessageDigest.getInstance("SHA-256")
      openStream(uri).use { input ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
          val read = input.read(buffer)
          if (read < 0) break
          digest.update(buffer, 0, read)
        }
      }
      digest.digest().joinToString("") { "%02x".format(it) }
    }
  }

  private fun checkPage(renderer: PdfRenderer, pageIndex: Int) {
    if (pageIndex < 0 || pageIndex >= renderer.pageCount) {
      throw CodedException("ERR_PDF_PAGE", "Page $pageIndex is out of range", null)
    }
  }

  private fun renderBitmap(renderer: PdfRenderer, pageIndex: Int, maxLongSide: Int): Bitmap {
    checkPage(renderer, pageIndex)
    return renderer.openPage(pageIndex).use { page ->
      val scale = maxLongSide.toFloat() / maxOf(page.width, page.height)
      val width = (page.width * scale).toInt().coerceAtLeast(1)
      val height = (page.height * scale).toInt().coerceAtLeast(1)
      val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
      // Pages render transparent; JPEG needs an opaque white page underneath.
      bitmap.eraseColor(Color.WHITE)
      page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
      bitmap
    }
  }

  private fun save(bitmap: Bitmap, pageIndex: Int, suffix: String, quality: Int): RenderedPage {
    val dir = File(context.cacheDir, "pdf-pages").apply { mkdirs() }
    val file = File(dir, "${UUID.randomUUID()}-p${pageIndex + 1}$suffix.jpg")
    FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.JPEG, quality.coerceIn(1, 100), it) }
    return RenderedPage().apply {
      this.uri = Uri.fromFile(file).toString()
      this.width = bitmap.width
      this.height = bitmap.height
    }
  }

  private fun <T> withRenderer(uri: String, password: String?, block: (PdfRenderer) -> T): T {
    val descriptor = openDescriptor(uri)
    val renderer = try {
      if (modern && !password.isNullOrEmpty()) {
        PdfRenderer(descriptor, LoadParams.Builder().setPassword(password).build())
      } else {
        PdfRenderer(descriptor)
      }
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

  private fun openStream(uri: String): InputStream {
    val parsed = Uri.parse(uri)
    return try {
      if (parsed.scheme == "content") {
        context.contentResolver.openInputStream(parsed) ?: throw PdfUnreadableException(null)
      } else {
        File(parsed.path ?: uri).inputStream()
      }
    } catch (e: CodedException) {
      throw e
    } catch (e: Exception) {
      throw PdfUnreadableException(e)
    }
  }
}
