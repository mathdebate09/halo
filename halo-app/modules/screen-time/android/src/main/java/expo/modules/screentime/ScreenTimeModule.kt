package expo.modules.screentime

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class ScreenEvent : Record {
  @Field var at: Double = 0.0
  @Field var on: Boolean = false
}

// Reads when the screen turned on and off (UsageStatsManager), so sleep can be estimated without a
// tracker. Needs the Usage access special permission, which only the user can grant in Settings.
// Nothing else from usage stats is read: no app names, no per-app time.
class ScreenTimeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ScreenTime")

    Function("hasAccess") {
      val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
      val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
      } else {
        @Suppress("DEPRECATION")
        ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
      }
      mode == AppOpsManager.MODE_ALLOWED
    }

    Function("openSettings") {
      val app = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(app)
      } catch (e: Exception) {
        // Some builds only open the full list.
        context.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }

    AsyncFunction("screenEvents") { from: Double, to: Double ->
      val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      val events = manager.queryEvents(from.toLong(), to.toLong())
      val out = mutableListOf<ScreenEvent>()
      val event = UsageEvents.Event()
      while (events.hasNextEvent()) {
        events.getNextEvent(event)
        val on = when (event.eventType) {
          UsageEvents.Event.SCREEN_INTERACTIVE -> true
          UsageEvents.Event.SCREEN_NON_INTERACTIVE -> false
          else -> null
        } ?: continue
        out.add(ScreenEvent().apply {
          at = event.timeStamp.toDouble()
          this.on = on
        })
      }
      out
    }
  }
}
