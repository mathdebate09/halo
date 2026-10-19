package expo.modules.overlay

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Halo's side of the floating overlay: whether it may draw over other apps, starting it, handing
// it the latest snapshot and taking back what was logged on it. Halo being on screen is tracked
// here from the activity's own lifecycle, so a killed app can never leave the bubble hidden.
class OverlayModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  // Kept from creation: when the task is swiped away the React context is gone before the
  // activity's destroy arrives, and the flag must still be cleared.
  private var appCtx: Context? = null

  private fun setForeground(value: Boolean) {
    val c = appCtx ?: appContext.reactContext?.applicationContext ?: return
    OverlayStore.setForeground(c, value)
    OverlayBus.service?.refresh()
  }

  override fun definition() = ModuleDefinition {
    Name("Overlay")

    Events("onQueued")

    OnCreate {
      appCtx = appContext.reactContext?.applicationContext
      OverlayBus.onQueued = { sendEvent("onQueued", mapOf<String, Any>()) }
    }
    OnDestroy {
      OverlayBus.onQueued = null
    }

    OnActivityEntersForeground { setForeground(true) }
    OnActivityEntersBackground { setForeground(false) }
    OnActivityDestroys { setForeground(false) }

    /** Whether "Display over other apps" is allowed. */
    Function("canDraw") { Settings.canDrawOverlays(context) }

    /** Opens Halo's "Display over other apps" page. */
    Function("openSettings") {
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      runCatching { context.startActivity(intent) }.onFailure {
        context.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }

    /** Brings the overlay back (also after it was dragged away). False without the permission. */
    Function("start") {
      OverlayStore.setClosed(context, false)
      OverlayService.start(context)
    }

    /** Turns it off until start() (also across a restart). */
    Function("stop") {
      OverlayStore.setClosed(context, true)
      context.stopService(Intent(context, OverlayService::class.java))
    }

    Function("isRunning") { OverlayBus.service != null }

    /** The latest snapshot (JSON). Kept for when Halo isn't running. */
    Function("setSnapshot") { json: String ->
      OverlayStore.setSnapshot(context, json)
      OverlayBus.service?.refresh()
    }

    /** What a voice turn from the ring needs (consent, backend, today's snapshot), as JSON. */
    Function("setVoice") { json: String -> OverlayStore.setVoice(context, json) }

    /** Chunk 27a spike: the next ring tap records 4 s and plays it back ("fgs" or "activity"). */
    Function("armVoiceSpike") { mode: String -> OverlayStore.armVoiceSpike(context, mode) }

    Function("voiceSpikeResult") { OverlayStore.voiceSpikeResult(context) }

    /** Everything logged on the overlay since the last call (a JSON array string); the queue empties. */
    Function("takeQueue") { OverlayStore.takeQueue(context) }
  }
}
