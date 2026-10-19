package expo.modules.overlay

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

// Everything the overlay needs while Halo's JS isn't running: the last snapshot the app wrote, the
// user's choices (closed, position) and the queue of things logged from the overlay. All in
// SharedPreferences, so it survives the app being killed and the phone restarting.
object OverlayStore {
  private const val PREFS = "halo.overlay"

  private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun snapshot(c: Context): JSONObject? =
    prefs(c).getString("snapshot", null)?.let { runCatching { JSONObject(it) }.getOrNull() }

  fun setSnapshot(c: Context, json: String) = prefs(c).edit().putString("snapshot", json).apply()

  /** Dragged to the ×: stays away until Halo opens again. */
  fun closed(c: Context) = prefs(c).getBoolean("closed", false)
  fun setClosed(c: Context, value: Boolean) = prefs(c).edit().putBoolean("closed", value).apply()

  /** Halo itself is on screen, so the bubble steps aside. */
  fun foreground(c: Context) = prefs(c).getBoolean("foreground", false)
  fun setForeground(c: Context, value: Boolean) = prefs(c).edit().putBoolean("foreground", value).apply()

  fun position(c: Context): Pair<Int, Int>? {
    val p = prefs(c)
    if (!p.contains("x")) return null
    return p.getInt("x", 0) to p.getInt("y", 0)
  }
  fun setPosition(c: Context, x: Int, y: Int) = prefs(c).edit().putInt("x", x).putInt("y", y).apply()

  /** Flags acted on from the overlay: they stop blinking and peeking before Halo has caught up. */
  fun handled(c: Context): Set<String> =
    prefs(c).getString("handled", "")!!.split(',').filter { it.isNotEmpty() }.toSet()

  fun addHandled(c: Context, id: String) {
    val list = (prefs(c).getString("handled", "")!!.split(',').filter { it.isNotEmpty() && it != id } + id).takeLast(30)
    prefs(c).edit().putString("handled", list.joinToString(",")).apply()
  }

  /** Adds one entry for the app to pick up (written at once: the process may die right after). */
  @Synchronized
  fun enqueue(c: Context, item: JSONObject) {
    val queue = runCatching { JSONArray(prefs(c).getString("queue", "[]")) }.getOrDefault(JSONArray())
    queue.put(item)
    prefs(c).edit().putString("queue", queue.toString()).commit()
  }

  /** Everything queued so far, as a JSON array string; the queue is emptied. */
  @Synchronized
  fun takeQueue(c: Context): String {
    val queue = prefs(c).getString("queue", "[]") ?: "[]"
    prefs(c).edit().putString("queue", "[]").commit()
    return queue
  }
}

/** The running service and the module's event hook, when either is alive (same process). */
object OverlayBus {
  @Volatile var service: OverlayService? = null
  @Volatile var onQueued: (() -> Unit)? = null
}
