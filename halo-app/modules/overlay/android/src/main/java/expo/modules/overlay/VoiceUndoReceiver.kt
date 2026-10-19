package expo.modules.overlay

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONObject
import java.util.UUID

// Undo on a voice log, from its notification or the overlay's line: an `undo` entry per log for
// Halo to drain (it takes back the meal, the water or the weigh-in it replaced).
class VoiceUndoReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val ids = intent.getStringArrayExtra(IDS)?.toList() ?: return
    undo(context, ids, intent.getIntExtra(NOTIFICATION, 0))
  }

  companion object {
    const val IDS = "ids"
    const val NOTIFICATION = "notification"

    fun undo(context: Context, ids: List<String>, notification: Int) {
      for (id in ids) {
        OverlayStore.enqueue(
          context,
          JSONObject().put("kind", "undo").put("targetId", id)
            .put("clientId", UUID.randomUUID().toString()).put("at", System.currentTimeMillis()),
        )
      }
      if (OverlayStore.lastVoiceLogs(context).any { it in ids }) OverlayStore.setLastVoiceLogs(context, emptyList())
      OverlayBus.onQueued?.invoke()
      if (notification != 0) context.getSystemService(NotificationManager::class.java)?.cancel(notification)
    }
  }
}
