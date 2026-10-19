package expo.modules.overlay

import android.animation.ValueAnimator
import android.app.ActivityManager
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.view.inputmethod.InputMethodManager
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.UUID
import kotlin.math.hypot

// The floating overlay: a foreground service that keeps Halo's ring over other apps. It reads the
// snapshot Halo last wrote and only shows what the PA already decided; anything logged here goes
// into a queue that Halo drains into its own store and outbox (local-first, nothing waits on it).
class OverlayService : Service() {
  private val main = Handler(Looper.getMainLooper())
  private lateinit var wm: WindowManager

  private var bubble: BubbleView? = null
  private var bubbleParams: WindowManager.LayoutParams? = null
  private var target: CloseTarget? = null
  private var card: CardView? = null
  private var snap: ValueAnimator? = null
  private val tick = Runnable { render() }
  private var destroyed = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    wm = getSystemService(WINDOW_SERVICE) as WindowManager
    OverlayBus.service = this
    startAsForeground()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!Settings.canDrawOverlays(this) || OverlayStore.closed(this)) {
      stopSelf()
      return START_NOT_STICKY
    }
    main.post {
      ensureBubble()
      render()
    }
    return START_STICKY
  }

  override fun onDestroy() {
    destroyed = true
    main.removeCallbacksAndMessages(null)
    snap?.cancel()
    collapse()
    removeTarget()
    bubble?.let { runCatching { wm.removeView(it) } }
    bubble = null
    if (OverlayBus.service === this) OverlayBus.service = null
    super.onDestroy()
  }

  /** The snapshot or Halo's foreground state changed. Safe from any thread. */
  fun refresh() {
    main.post { render() }
    // The process state lags an activity change by a moment: look again once it has settled.
    main.postDelayed({ render() }, 800)
  }

  /** Halo's own screen is showing: the flag says so and Android agrees (a stale flag can't hide the ring). */
  private fun haloOnScreen(): Boolean {
    if (!OverlayStore.foreground(this)) return false
    val info = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(info)
    return info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }

  // ── Foreground notification ────────────────────────────────────────────────────

  private fun startAsForeground() {
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL, "On screen", NotificationManager.IMPORTANCE_MIN).apply { setShowBadge(false) },
    )
    val open = packageManager.getLaunchIntentForPackage(packageName)
    val tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val icon = resources.getIdentifier("notification_icon", "drawable", packageName).takeIf { it != 0 }
      ?: applicationInfo.icon
    val notification = Notification.Builder(this, CHANNEL)
      .setSmallIcon(icon)
      .setContentTitle("Halo is on screen")
      .setContentText("Drag the ring to the × to hide it.")
      .setContentIntent(tap)
      .setOngoing(true)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  // ── The bubble ─────────────────────────────────────────────────────────────────

  private val size get() = dpi(60f)
  private val margin get() = dpi(8f)
  private val screenW get() = resources.displayMetrics.widthPixels
  private val screenH get() = resources.displayMetrics.heightPixels

  private fun overlayParams(w: Int, h: Int, flags: Int) = WindowManager.LayoutParams(
    w,
    h,
    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
    flags,
    PixelFormat.TRANSLUCENT,
  )

  @SuppressLint("ClickableViewAccessibility")
  private fun ensureBubble() {
    if (bubble != null) return
    // The × goes in first, so the ring passes over it while dragging.
    addTarget()
    val view = BubbleView(this)
    val params = overlayParams(size, size, WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE).apply {
      gravity = Gravity.TOP or Gravity.START
      val saved = OverlayStore.position(this@OverlayService)
      x = saved?.first ?: (screenW - size - margin)
      y = saved?.second ?: (screenH / 3)
    }
    val slop = ViewConfiguration.get(this).scaledTouchSlop
    var downX = 0f
    var downY = 0f
    var startX = 0
    var startY = 0
    var dragging = false
    view.setOnTouchListener { _, e ->
      when (e.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          snap?.cancel()
          downX = e.rawX
          downY = e.rawY
          startX = params.x
          startY = params.y
          dragging = false
          view.animate().scaleX(0.94f).scaleY(0.94f).setDuration(100).start()
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = e.rawX - downX
          val dy = e.rawY - downY
          if (!dragging && hypot(dx, dy) > slop) {
            dragging = true
            showTarget()
          }
          if (dragging) {
            params.x = startX + dx.toInt()
            params.y = (startY + dy.toInt()).coerceIn(0, screenH - size)
            wm.updateViewLayout(view, params)
            target?.hot = overTarget(params)
          }
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          view.animate().scaleX(1f).scaleY(1f).setDuration(160).start()
          if (!dragging) {
            if (e.actionMasked == MotionEvent.ACTION_UP) expand()
          } else {
            val close = overTarget(params)
            hideTarget()
            if (close) closeUntilNextOpen() else snapToEdge(view, params)
          }
        }
      }
      true
    }
    wm.addView(view, params)
    bubble = view
    bubbleParams = params
  }

  private fun overTarget(p: WindowManager.LayoutParams): Boolean {
    val cx = p.x + size / 2f
    val cy = p.y + size / 2f
    return hypot(cx - screenW / 2f, cy - (screenH - dp(96f))) < dp(72f)
  }

  /** Eases to the nearer side (Oura calm: decelerating, no bounce) and remembers the spot. */
  private fun snapToEdge(view: View, p: WindowManager.LayoutParams) {
    val toX = if (p.x + size / 2 < screenW / 2) margin else screenW - size - margin
    snap = ValueAnimator.ofInt(p.x, toX).apply {
      duration = 320
      interpolator = DecelerateInterpolator(1.6f)
      addUpdateListener {
        p.x = it.animatedValue as Int
        if (view.isAttachedToWindow) wm.updateViewLayout(view, p)
      }
      start()
    }
    OverlayStore.setPosition(this, toX, p.y)
  }

  private fun addTarget() {
    val view = CloseTarget(this).apply { visibility = View.INVISIBLE }
    val s = dpi(64f)
    val params = overlayParams(
      s,
      s,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = (screenW - s) / 2
      y = (screenH - dp(96f) - s / 2f).toInt()
    }
    wm.addView(view, params)
    target = view
  }

  private fun showTarget() {
    val view = target ?: return
    view.alpha = 0f
    view.visibility = View.VISIBLE
    view.animate().alpha(1f).setDuration(200).start()
  }

  private fun hideTarget() {
    target?.apply {
      hot = false
      visibility = View.INVISIBLE
    }
  }

  private fun removeTarget() {
    target?.let { runCatching { wm.removeView(it) } }
    target = null
  }

  /** Dragged to the ×: gone until Halo is opened again (Halo's start() clears this). */
  private fun closeUntilNextOpen() {
    OverlayStore.setClosed(this, true)
    stopSelf()
  }

  // ── The card ───────────────────────────────────────────────────────────────────

  private fun expand() {
    val s = Snapshot.parse(OverlayStore.snapshot(this)) ?: return
    if (card != null) return
    val view = CardView(this, s, s.flagAt(System.currentTimeMillis()), object : CardActions {
      override fun onFlag(flag: Flag) = runFlag(flag)
      override fun onOpenApp() {
        open(s.openUrl)
        collapse()
      }
      override fun onLogMeal(text: String) {
        enqueue(JSONObject().put("kind", "meal_text").put("text", text))
        main.postDelayed({ collapse() }, 900)
      }
      override fun onDismiss() = collapse()
    })
    val params = overlayParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
    ).apply {
      gravity = Gravity.TOP
      y = dpi(40f)
      softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING
    }
    view.setOnTouchListener { _, e ->
      if (e.actionMasked == MotionEvent.ACTION_OUTSIDE) collapse()
      false
    }
    view.alpha = 0f
    view.translationY = -dp(12f)
    wm.addView(view, params)
    view.animate().alpha(1f).translationY(0f).setDuration(260).setInterpolator(DecelerateInterpolator()).start()
    card = view
    bubble?.setCycling(false)
    bubble?.visibility = View.INVISIBLE
  }

  private fun collapse() {
    val view = card ?: return
    card = null
    getSystemService(InputMethodManager::class.java)?.hideSoftInputFromWindow(view.windowToken, 0)
    runCatching { wm.removeView(view) }
    if (!haloOnScreen()) bubble?.visibility = View.VISIBLE
    render()
  }

  /** The flag's prepared step: done in place when it can be, else opened in Halo. */
  private fun runFlag(flag: Flag) {
    val quick = flag.quick
    if (quick != null) {
      enqueue(JSONObject(quick.toString()).put("briefId", flag.id))
    } else if (flag.url != null) {
      enqueue(JSONObject().put("kind", "acted").put("briefId", flag.id))
      open(flag.url)
    }
    collapse()
  }

  private fun enqueue(item: JSONObject) {
    item.put("clientId", UUID.randomUUID().toString()).put("at", System.currentTimeMillis())
    OverlayStore.enqueue(this, item)
    OverlayBus.onQueued?.invoke()
  }

  /** Opens a Halo route (allowed from the background: the app may draw over other apps). */
  private fun open(url: String) {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { startActivity(intent) }.onFailure {
      packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
        startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }
  }

  // ── Rendering ──────────────────────────────────────────────────────────────────

  private fun render() {
    if (destroyed) return
    main.removeCallbacks(tick)
    val view = bubble ?: return
    val params = bubbleParams ?: return
    val s = Snapshot.parse(OverlayStore.snapshot(this))
    val hidden = haloOnScreen() || s == null
    if (hidden) collapse()
    view.visibility = if (hidden) View.GONE else if (card != null) View.INVISIBLE else View.VISIBLE
    val wanted = if (hidden) {
      params.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
    } else {
      params.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
    }
    if (wanted != params.flags) {
      params.flags = wanted
      wm.updateViewLayout(view, params)
    }
    if (s == null) return
    val now = System.currentTimeMillis()
    view.snapshot = s
    view.flag = s.flagAt(now)
    view.setCycling(!hidden && card == null && view.flag?.icon != null)
    view.invalidate()
    // Wake only when a flag starts or ends: no polling.
    s.nextChange(now)?.let { main.postDelayed(tick, (it - now).coerceIn(1_000, 6 * 3_600_000L)) }
  }

  companion object {
    private const val CHANNEL = "overlay"
    private const val NOTIFICATION_ID = 7341

    /** Starts the overlay if it may draw and wasn't dragged away. Returns whether it started. */
    fun start(context: Context): Boolean {
      if (!Settings.canDrawOverlays(context) || OverlayStore.closed(context)) return false
      ContextCompat.startForegroundService(context, Intent(context, OverlayService::class.java))
      return true
    }
  }
}
