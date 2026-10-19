package expo.modules.overlay

import android.graphics.Color
import org.json.JSONObject

// The snapshot Halo writes (src/overlay/publish.ts): the scores, the theme's colors and every flag
// the PA has for today, each with the time it starts and stops applying. The overlay never decides
// anything itself; it only shows the flag whose time has come, so it stays right while Halo is
// closed.

class Flag(
  val id: String,
  val title: String,
  val line: String,
  val actionLabel: String?,
  /** Done in place (e.g. a glass of water), queued for the app. */
  val quick: JSONObject?,
  /** Opened in Halo instead (the logger pre-filled, the Advisor). */
  val url: String?,
  val at: Long,
  val expiresAt: Long,
  val critical: Boolean,
  /** What needs the user (meal, water, sleep, vitals, weight, activity, report): the ring alternates to it. */
  val icon: String?,
)

class Palette(val bg: Int, val surface: Int, val text: Int, val muted: Int, val accent: Int, val alert: Int)

class Snapshot(
  val overall: Int,
  val diet: Int,
  val activity: Int,
  val vitals: Int,
  val colors: Palette,
  val flags: List<Flag>,
  /** Where Open app goes (the logger, for a photo or the mic). */
  val openUrl: String,
) {
  /** The flag to show now: a critical reading first, else the one that started last. `done` = acted on here. */
  fun flagAt(now: Long, done: Set<String> = emptySet()): Flag? {
    val live = flags.filter { it.at <= now && now < it.expiresAt && it.id !in done }
    return live.firstOrNull { it.critical } ?: live.maxByOrNull { it.at }
  }

  /** When what's shown next changes (a flag starts or ends), or null. */
  fun nextChange(now: Long): Long? =
    flags.flatMap { listOf(it.at, it.expiresAt) }.filter { it > now }.minOrNull()

  companion object {
    private fun color(o: JSONObject?, key: String, fallback: Int): Int =
      o?.optString(key)?.takeIf { it.isNotEmpty() }?.let { runCatching { Color.parseColor(it) }.getOrNull() } ?: fallback

    fun parse(json: JSONObject?): Snapshot? {
      if (json == null) return null
      val s = json.optJSONObject("scores") ?: return null
      val c = json.optJSONObject("colors")
      val flags = mutableListOf<Flag>()
      val list = json.optJSONArray("flags")
      for (i in 0 until (list?.length() ?: 0)) {
        val f = list!!.optJSONObject(i) ?: continue
        flags.add(
          Flag(
            id = f.optString("id"),
            title = f.optString("title"),
            line = f.optString("line"),
            actionLabel = f.optString("actionLabel").takeIf { it.isNotEmpty() && !f.isNull("actionLabel") },
            quick = f.optJSONObject("quick"),
            url = f.optString("url").takeIf { it.isNotEmpty() && !f.isNull("url") },
            at = f.optLong("at"),
            expiresAt = f.optLong("expiresAt", Long.MAX_VALUE),
            critical = f.optBoolean("critical"),
            icon = f.optString("icon").takeIf { it.isNotEmpty() && !f.isNull("icon") },
          ),
        )
      }
      return Snapshot(
        overall = s.optInt("overall"),
        diet = s.optInt("diet"),
        activity = s.optInt("activity"),
        vitals = s.optInt("vitals"),
        colors = Palette(
          bg = color(c, "bg", Color.parseColor("#101716")),
          surface = color(c, "surface", Color.parseColor("#1b2423")),
          text = color(c, "text", Color.WHITE),
          muted = color(c, "muted", Color.LTGRAY),
          accent = color(c, "accent", Color.parseColor("#a2bad8")),
          alert = color(c, "alert", Color.parseColor("#e0a46e")),
        ),
        flags = flags,
        openUrl = json.optString("openUrl").ifEmpty { "haloapp://log" },
      )
    }
  }
}
