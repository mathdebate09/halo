package expo.modules.overlay

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// After a restart or an app update the overlay comes back on its own, unless the user dragged it
// away (then it waits for Halo to be opened). Halo isn't on screen at this point.
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    OverlayStore.setForeground(context, false)
    runCatching { OverlayService.start(context) }
  }
}
