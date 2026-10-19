package expo.modules.overlay

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper

// Nothing to see: while it's on screen Halo counts as visible, so the overlay's service may take
// the microphone. It closes itself right after.
class VoiceActivity : Activity() {
  private var started = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    overridePendingTransition(0, 0)
  }

  override fun onResume() {
    super.onResume()
    if (started) return
    started = true
    OverlayBus.service?.spikeFromActivity()
    Handler(Looper.getMainLooper()).postDelayed({ finish() }, 400)
  }

  override fun finish() {
    super.finish()
    overridePendingTransition(0, 0)
  }
}
