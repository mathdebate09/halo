package expo.modules.overlay

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sqrt

// One spoken log from the ring: 16 kHz mono PCM read on its own thread, ended by silence after
// speech, by stop() (a second tap) or by the time limit. Speech is told from the room by a
// level well above the first moments' noise floor. The result is a WAV in memory, its level raised
// to a normal loudness (this phone's mic records at about 1% of full scale); nothing is written to
// disk.
class VoiceRecorder(private val listener: Listener) {
  interface Listener {
    /** 0..1, about every 50 ms (drives the dots). Main thread. */
    fun onLevel(level: Float)
    /** Main thread, once. */
    fun onDone(result: Result)
  }

  class Result(
    /** A complete WAV file, or null when nothing was recorded. */
    val wav: ByteArray?,
    val heardSpeech: Boolean,
    /** Loudest sample (0..32767); 0 everywhere means Android silenced the mic. */
    val peak: Int,
    /** Loudest sample after the first second (Android silences a denied mic a moment in). */
    val laterPeak: Int,
    val durationMs: Long,
    val error: String?,
  )

  private val main = Handler(Looper.getMainLooper())
  @Volatile private var stopping = false
  private var thread: Thread? = null

  /** Starts reading the mic. The caller holds RECORD_AUDIO and a microphone-type foreground service. */
  @SuppressLint("MissingPermission")
  fun start(maxMs: Long = MAX_MS, endOnSilence: Boolean = true) {
    if (thread != null) return
    stopping = false
    thread = Thread({ run(maxMs, endOnSilence) }, "halo-voice").apply { start() }
  }

  /** Ends now; what was heard so far is kept. */
  fun stop() {
    stopping = true
  }

  @SuppressLint("MissingPermission")
  private fun run(maxMs: Long, endOnSilence: Boolean) {
    val minBuf = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val record = try {
      AudioRecord(MediaRecorder.AudioSource.MIC, RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, max(minBuf, FRAME * 2 * 4))
    } catch (e: Exception) {
      finish(Result(null, false, 0, 0, 0, e.javaClass.simpleName))
      return
    }
    if (record.state != AudioRecord.STATE_INITIALIZED) {
      record.release()
      finish(Result(null, false, 0, 0, 0, "not_initialized"))
      return
    }
    val pcm = ByteArrayOutputStream()
    val frame = ShortArray(FRAME)
    val bytes = ByteBuffer.allocate(FRAME * 2).order(ByteOrder.LITTLE_ENDIAN)
    var peak = 0
    var laterPeak = 0
    var floor = -1.0
    var spoke = false
    var loudMs = 0L
    var quietMs = 0L
    var elapsed = 0L
    var error: String? = null
    try {
      record.startRecording()
      while (!stopping && elapsed < maxMs) {
        val n = record.read(frame, 0, FRAME)
        if (n <= 0) {
          error = "read_$n"
          break
        }
        bytes.clear()
        var sum = 0.0
        for (i in 0 until n) {
          val v = frame[i].toInt()
          val a = if (v < 0) -v else v
          if (a > peak) peak = a
          if (elapsed >= 1000 && a > laterPeak) laterPeak = a
          sum += v.toDouble() * v
          bytes.putShort(frame[i])
        }
        pcm.write(bytes.array(), 0, n * 2)
        elapsed += n * 1000L / RATE
        val db = 20 * log10(max(sqrt(sum / n), 1.0))
        val frameMs = n * 1000L / RATE
        // The room's level: averaged once the tap's thump has passed, then following the room
        // slowly through the quiet frames.
        val calibrated = elapsed > SETTLE_MS + CALIBRATE_MS
        if (elapsed > SETTLE_MS && !calibrated) floor = if (floor < 0) db else (floor + db) / 2
        val loud = calibrated && db > floor + SPEECH_DB && db > MIN_SPEECH_DB
        if (calibrated && !loud) floor = floor * 0.97 + db * 0.03
        // Speech is loud for a while, not one knock: 300 ms of it in all.
        if (loud) {
          loudMs += frameMs
          quietMs = 0
          if (loudMs >= SPEECH_MS) spoke = true
        } else {
          quietMs += frameMs
        }
        val level = ((db - floor) / 30.0).coerceIn(0.0, 1.0).toFloat()
        main.post { listener.onLevel(level) }
        if (endOnSilence && spoke && quietMs >= END_SILENCE_MS) break
        if (endOnSilence && !spoke && elapsed >= NO_SPEECH_MS) break
      }
    } catch (e: Exception) {
      error = e.javaClass.simpleName
    } finally {
      runCatching { record.stop() }
      record.release()
    }
    val data = pcm.toByteArray()
    finish(Result(if (data.isEmpty()) null else wav(louder(data, peak)), spoke, peak, laterPeak, elapsed, error))
  }

  private fun finish(result: Result) {
    main.post {
      thread = null
      listener.onDone(result)
    }
  }

  companion object {
    const val RATE = 16_000
    /** 20 ms. */
    private const val FRAME = RATE / 50
    const val MAX_MS = 20_000L
    private const val END_SILENCE_MS = 1_200L
    private const val NO_SPEECH_MS = 6_000L
    /** Ignored at the start (the tap itself), then measured as the room's level. */
    private const val SETTLE_MS = 150L
    private const val CALIBRATE_MS = 250L
    private const val SPEECH_MS = 300L
    /** Speech is this far over the room's level; a quiet voice at arm's length still counts. */
    private const val SPEECH_DB = 10.0
    private const val MIN_SPEECH_DB = 20.0
    /** The loudest sample is raised to about 70% of full scale, by at most this much. */
    private const val MAX_GAIN = 30.0

    /** The recording scaled so its loudest sample sits at ~70% of full scale (16-bit LE, in place). */
    fun louder(pcm: ByteArray, peak: Int): ByteArray {
      if (peak <= 0) return pcm
      val gain = minOf(MAX_GAIN, 0.7 * 32767 / peak)
      if (gain <= 1.05) return pcm
      val buf = ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN)
      for (i in 0 until pcm.size / 2) {
        val v = (buf.getShort(i * 2) * gain).toInt().coerceIn(-32768, 32767)
        buf.putShort(i * 2, v.toShort())
      }
      return pcm
    }

    /** A 44-byte header in front of 16-bit mono PCM. */
    fun wav(pcm: ByteArray, rate: Int = RATE): ByteArray {
      val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN).apply {
        put("RIFF".toByteArray()); putInt(36 + pcm.size); put("WAVE".toByteArray())
        put("fmt ".toByteArray()); putInt(16); putShort(1); putShort(1)
        putInt(rate); putInt(rate * 2); putShort(2); putShort(16)
        put("data".toByteArray()); putInt(pcm.size)
      }
      return header.array() + pcm
    }
  }
}
