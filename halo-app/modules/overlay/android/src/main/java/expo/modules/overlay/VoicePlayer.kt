package expo.modules.overlay

import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Handler
import android.os.Looper
import java.io.InputStream

// Speaks a reply from the overlay's service: 16-bit mono PCM played as it arrives, so speech
// starts before the whole reply has downloaded. Music ducks while it speaks; a call, another
// app taking focus or stop() (a tap on the ring) ends it at once.
class VoicePlayer(private val context: Context) {
  private val audio = context.getSystemService(AudioManager::class.java)
  private val main = Handler(Looper.getMainLooper())
  @Volatile private var stopped = false
  private var track: AudioTrack? = null
  private var focus: AudioFocusRequest? = null

  private val attributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_ASSISTANT)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
    .build()

  /**
   * Plays `pcm` (read to its end on this thread, so call it off the main thread). `onDone` runs on
   * the main thread with whether it played to the end.
   */
  fun play(pcm: InputStream, rate: Int, onDone: (Boolean) -> Unit) {
    stopped = false
    if (!takeFocus()) {
      main.post { onDone(false) }
      return
    }
    val minBuf = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val t = AudioTrack.Builder()
      .setAudioAttributes(attributes)
      .setAudioFormat(
        AudioFormat.Builder()
          .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
          .setSampleRate(rate)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .build(),
      )
      .setBufferSizeInBytes(minBuf * 4)
      .setTransferMode(AudioTrack.MODE_STREAM)
      .build()
    track = t
    var complete = false
    try {
      t.play()
      val buf = ByteArray(4096)
      // A sample is two bytes: an odd chunk keeps its last byte for the next write.
      var carry = -1
      var written = 0L
      while (!stopped) {
        val n = pcm.read(buf, if (carry >= 0) 1 else 0, buf.size - 1)
        if (n < 0) {
          complete = true
          break
        }
        var len = n
        if (carry >= 0) {
          buf[0] = carry.toByte()
          len += 1
          carry = -1
        }
        if (len % 2 == 1) {
          carry = buf[len - 1].toInt() and 0xff
          len -= 1
        }
        if (len > 0) written += t.write(buf, 0, len).coerceAtLeast(0)
      }
      if (complete && !stopped) {
        // Let what's buffered play out before letting go of focus.
        t.stop()
        val frames = written / 2
        val until = System.currentTimeMillis() + t.bufferSizeInFrames * 1000L / rate + 300
        while (!stopped && t.playbackHeadPosition < frames && System.currentTimeMillis() < until) Thread.sleep(20)
      }
    } catch (_: Exception) {
      complete = false
    } finally {
      runCatching { pcm.close() }
      release()
    }
    val played = complete && !stopped
    main.post { onDone(played) }
  }

  /** Ends speech now (the text stays on screen). Safe from any thread. */
  fun stop() {
    stopped = true
    runCatching { track?.pause(); track?.flush() }
  }

  private fun takeFocus(): Boolean {
    val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
      .setAudioAttributes(attributes)
      .setOnAudioFocusChangeListener { change ->
        if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) stop()
      }
      .build()
    focus = request
    return audio.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
  }

  private fun release() {
    track?.let { runCatching { it.release() } }
    track = null
    focus?.let { audio.abandonAudioFocusRequest(it) }
    focus = null
  }

  companion object {
    /** On a call, or the phone is in a call-like mode (a video call app). */
    fun onCall(context: Context): Boolean {
      val mode = context.getSystemService(AudioManager::class.java).mode
      return mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION || mode == AudioManager.MODE_RINGTONE
    }

    /**
     * Whether a reply may be spoken: not under Do Not Disturb, not on a call, and not with the
     * media volume at zero. Silent and vibrate still speak (the user's call, chunk 27).
     */
    fun maySpeak(context: Context): Boolean {
      val dnd = context.getSystemService(NotificationManager::class.java).currentInterruptionFilter
      if (dnd != NotificationManager.INTERRUPTION_FILTER_ALL && dnd != NotificationManager.INTERRUPTION_FILTER_UNKNOWN) return false
      if (onCall(context)) return false
      return context.getSystemService(AudioManager::class.java).getStreamVolume(AudioManager.STREAM_MUSIC) > 0
    }
  }
}
