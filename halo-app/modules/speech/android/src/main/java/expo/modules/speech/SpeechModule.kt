package expo.modules.speech

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

// Dictation without any server: Android's on-device recognizer (Android 12+), the same engine the
// keyboard's offline voice typing uses. Words stream back as they're recognised; the audio never
// leaves the phone. One session at a time.
class SpeechModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var recognizer: SpeechRecognizer? = null

  private fun intent(language: String?) =
    Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, language ?: Locale.getDefault().toLanguageTag())
    }

  private fun release() {
    recognizer?.destroy()
    recognizer = null
  }

  private fun first(results: Bundle?): String =
    results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""

  override fun definition() = ModuleDefinition {
    Name("Speech")

    Events("onStart", "onPartial", "onFinal", "onLevel", "onError", "onEnd")

    /** Whether this phone can recognise speech on the device (Android 12+ with a recognizer). */
    Function("isAvailable") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
        SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
    }

    Function("hasPermission") {
      ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
        PackageManager.PERMISSION_GRANTED
    }

    AsyncFunction("requestPermission") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(
        appContext.permissions,
        promise,
        Manifest.permission.RECORD_AUDIO,
      )
    }

    /** Starts listening; results arrive as events. A running session is replaced. */
    AsyncFunction("start") { language: String? ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        sendEvent("onError", mapOf("code" to "unavailable"))
        sendEvent("onEnd", mapOf<String, Any>())
        return@AsyncFunction
      }
      release()
      val r = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
      recognizer = r
      r.setRecognitionListener(object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) = sendEvent("onStart", mapOf<String, Any>())
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) = sendEvent("onLevel", mapOf("db" to rmsdB.toDouble()))
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onPartialResults(partial: Bundle?) =
          sendEvent("onPartial", mapOf("text" to first(partial)))
        override fun onResults(results: Bundle?) {
          sendEvent("onFinal", mapOf("text" to first(results)))
          sendEvent("onEnd", mapOf<String, Any>())
          release()
        }
        override fun onError(error: Int) {
          sendEvent("onError", mapOf("code" to codeOf(error)))
          sendEvent("onEnd", mapOf<String, Any>())
          release()
        }
        override fun onEvent(eventType: Int, params: Bundle?) {}
      })
      r.startListening(intent(language))
    }.runOnQueue(Queues.MAIN)

    /** Stops listening; what was heard so far arrives as the final result. */
    AsyncFunction("stop") {
      recognizer?.stopListening()
    }.runOnQueue(Queues.MAIN)

    /** Drops the session without a result. */
    AsyncFunction("cancel") {
      recognizer?.cancel()
      release()
    }.runOnQueue(Queues.MAIN)

    /** Asks the system to download the offline speech pack for a language (Android 13+). */
    AsyncFunction("downloadModel") { language: String? ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        val r = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        r.triggerModelDownload(intent(language))
        r.destroy()
        true
      } else {
        false
      }
    }.runOnQueue(Queues.MAIN)

    OnDestroy { release() }
  }

  private fun codeOf(error: Int): String = when (error) {
    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no_speech"
    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission"
    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
    SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "language"
    SpeechRecognizer.ERROR_CLIENT -> "client"
    else -> "error"
  }
}
