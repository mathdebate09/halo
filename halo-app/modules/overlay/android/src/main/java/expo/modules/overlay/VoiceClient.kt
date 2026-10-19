package expo.modules.overlay

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.util.Calendar
import java.util.UUID

// One voice turn from the ring, straight to Halo's backend (POST /voice/turns), so it works while
// Halo's JS isn't running: the recording, today's thread and the Advisor snapshot Halo last wrote
// (halo-shared voice.ts is the contract). The reply's speech is fetched next as a PCM stream.

/** The lines the ring shows on its own; the same words as VOICE_LINES in halo-shared/src/voice.ts. */
object VoiceLines {
  const val OFFLINE = "No connection. Long-press to type it."
  const val ON_CALL = "On a call."
  const val NO_SPEECH = "Didn’t catch that."
  const val FAILED = "Couldn’t answer that this time."
  const val TIMEOUT = "Couldn’t answer that this time."
}

/** Where each `open` action goes (VOICE_OPEN_URLS). */
val VOICE_OPEN_URLS = mapOf(
  "logger" to "haloapp://log",
  "camera" to "haloapp://log?camera=1",
  "advisor" to "haloapp://advisor",
  "weigh" to "haloapp://weigh-in",
  "sleep_hours" to "haloapp://sleep-hours",
  "ask_wake" to "haloapp://wake-time",
  "usage_access" to "haloapp://?ask=usage_access",
  "connect" to "haloapp://?ask=connect",
  "blood_work" to "haloapp://reports",
)

class VoiceReply(
  val turnId: String,
  val threadId: String,
  val heard: String,
  val text: String,
  val actions: JSONArray,
  val speechId: String?,
  val speechRate: Int,
)

class VoiceClient(private val context: Context) {
  private val main = Handler(Looper.getMainLooper())

  /** Today's day key, with Halo's 4 am rollover (halo-shared day.ts). */
  fun today(): String {
    val c = Calendar.getInstance()
    if (c.get(Calendar.HOUR_OF_DAY) < 4) c.add(Calendar.DAY_OF_MONTH, -1)
    return "%04d-%02d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
  }

  fun online(): Boolean {
    val cm = context.getSystemService(ConnectivityManager::class.java) ?: return true
    val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
    return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
  }

  /**
   * Sends a recording. `flag` is the alarm the tap retracted. `onReply` or `onFailure` (a line to
   * show) runs on the main thread.
   */
  fun send(
    voice: JSONObject,
    wav: ByteArray,
    flag: Flag?,
    onReply: (VoiceReply) -> Unit,
    onFailure: (String) -> Unit,
  ) {
    val today = today()
    // A snapshot (and its thread) from an earlier day would answer with yesterday's numbers.
    val fresh = voice.optString("threadId") == today
    val turnId = UUID.randomUUID().toString()
    val body = JSONObject()
      .put("turnId", turnId)
      .put("threadId", today)
      .put("context", if (fresh && !voice.isNull("context")) voice.opt("context") else JSONObject.NULL)
      .put("history", if (fresh) voice.optJSONArray("history") ?: JSONArray() else JSONArray())
      .put(
        "flag",
        flag?.let { JSONObject().put("id", it.id.take(80)).put("title", it.title.take(60)) } ?: JSONObject.NULL,
      )
      .put("audio", Base64.encodeToString(wav, Base64.NO_WRAP))
    Thread({
      val result = runCatching { post(voice, "/voice/turns", body.toString()) }
      main.post {
        result.fold(
          onSuccess = { (status, text) ->
            val json = runCatching { JSONObject(text) }.getOrNull()
            if (status == 200 && json != null && json.has("text")) {
              val speech = json.optJSONObject("speech")
              onReply(
                VoiceReply(
                  turnId = turnId,
                  threadId = today,
                  heard = json.optString("heard"),
                  text = json.optString("text"),
                  actions = json.optJSONArray("actions") ?: JSONArray(),
                  speechId = speech?.optString("id")?.takeIf { it.isNotEmpty() },
                  speechRate = speech?.optInt("rate", 24_000) ?: 24_000,
                ),
              )
            } else {
              onFailure(json?.optString("line")?.takeIf { it.isNotEmpty() } ?: VoiceLines.FAILED)
            }
          },
          onFailure = { e -> onFailure(if (e is SocketTimeoutException) VoiceLines.TIMEOUT else if (online()) VoiceLines.FAILED else VoiceLines.OFFLINE) },
        )
      }
    }, "halo-voice-turn").start()
  }

  /** The reply read aloud, as a stream of 16-bit mono PCM. Call off the main thread. */
  fun speech(voice: JSONObject, id: String): InputStream {
    val conn = open(voice, "/voice/speech/$id", "GET")
    conn.readTimeout = 15_000
    if (conn.responseCode != 200) {
      conn.disconnect()
      throw IllegalStateException("speech_${conn.responseCode}")
    }
    return conn.inputStream
  }

  private fun open(voice: JSONObject, path: String, method: String): HttpURLConnection {
    val api = voice.getJSONObject("api")
    val conn = URL(api.getString("url").trimEnd('/') + path).openConnection() as HttpURLConnection
    conn.requestMethod = method
    conn.connectTimeout = 6_000
    val headers = api.optJSONObject("headers")
    headers?.keys()?.forEach { conn.setRequestProperty(it, headers.getString(it)) }
    return conn
  }

  /** Status and body (the error body on a 4xx/5xx). */
  private fun post(voice: JSONObject, path: String, json: String): Pair<Int, String> {
    val conn = open(voice, path, "POST")
    conn.readTimeout = 25_000
    conn.doOutput = true
    conn.setRequestProperty("content-type", "application/json")
    try {
      conn.outputStream.use { it.write(json.toByteArray()) }
      val status = conn.responseCode
      val stream = if (status in 200..299) conn.inputStream else conn.errorStream
      return status to (stream?.bufferedReader()?.use { it.readText() } ?: "")
    } finally {
      conn.disconnect()
    }
  }
}
