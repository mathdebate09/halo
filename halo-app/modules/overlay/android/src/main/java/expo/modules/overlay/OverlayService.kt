package expo.modules.overlay

import android.animation.ValueAnimator
import android.animation.Animator
import android.animation.AnimatorListenerAdapter
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

  private var pill: PillView? = null
  private var pillParams: WindowManager.LayoutParams? = null
  /**
   * The pill stays out while a flag needs the user. A tap on the ring (or opening the card) puts it
   * away for that flag; it comes back after a while if they still haven't acted.
   */
  private var dismissedFlagId: String? = null
  private var dismissedAt = 0L
  private var dragging = false
  /** The flag the ring speaks for right now. */
  private var lastShownFlagId: String? = null

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
    pill?.let { runCatching { wm.removeView(it) } }
    pill = null
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
    // The × and the pill go in first, so the ring passes over the × and the pill tucks under it.
    addTarget()
    addPill()
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
            tuckPill(instant = true)
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
            // With the pill out, a tap on the ring puts the pill away; otherwise it opens the card.
            if (e.actionMasked == MotionEvent.ACTION_UP) {
              if (pill?.visibility == View.VISIBLE) dismissPill() else expand()
            }
          } else {
            dragging = false
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
      addListener(object : AnimatorListenerAdapter() {
        override fun onAnimationEnd(animation: Animator) = render()
      })
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

  // ── The pill ───────────────────────────────────────────────────────────────────

  private fun addPill() {
    val view = PillView(this)
    val params = overlayParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      size,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
    ).apply { gravity = Gravity.TOP or Gravity.START }
    view.label.setOnClickListener { expand() }
    wm.addView(view, params)
    pill = view
    pillParams = params
  }

  /** Slides the flag's words out from behind the ring ("Dinner time"), with one wiggle of the ring. */
  private fun showPill(flag: Flag, s: Snapshot) {
    val view = pill ?: return
    val params = pillParams ?: return
    val ring = bubbleParams ?: return
    val onRight = ring.x + size / 2 > screenW / 2
    view.bind(flag, s.colors, onRight, size)
    view.measure(View.MeasureSpec.UNSPECIFIED, View.MeasureSpec.UNSPECIFIED)
    val w = view.measuredWidth
    // The pill's inner end sits under the ring's middle.
    params.x = if (onRight) ring.x + size / 2 - w + dpi(4f) else ring.x + size / 2 - dpi(4f)
    params.y = ring.y
    params.flags = params.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
    wm.updateViewLayout(view, params)
    if (view.visibility == View.VISIBLE) return
    val from = (if (onRight) 1 else -1) * (w - size / 2f)
    view.label.animate().cancel()
    view.label.translationX = from
    view.label.alpha = 0f
    view.visibility = View.VISIBLE
    view.label.animate().translationX(0f).alpha(1f).setDuration(340).setInterpolator(DecelerateInterpolator(1.5f)).start()
    bubble?.wiggle()
  }

  /** Put away by the user: the flag keeps blinking, and the pill comes back after a while. */
  private fun dismissPill() {
    dismissedFlagId = lastShownFlagId
    dismissedAt = System.currentTimeMillis()
    tuckPill()
    render()
  }

  private fun tuckPill(instant: Boolean = false) {
    val view = pill ?: return
    val params = pillParams ?: return
    if (view.visibility != View.VISIBLE) return
    val done = {
      view.visibility = View.INVISIBLE
      params.flags = params.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
      if (view.isAttachedToWindow) wm.updateViewLayout(view, params)
    }
    view.label.animate().cancel()
    if (instant) {
      done()
      return
    }
    val onRight = (bubbleParams?.x ?: 0) + size / 2 > screenW / 2
    val to = (if (onRight) 1 else -1) * (view.width - size / 2f)
    view.label.animate().translationX(to).alpha(0f).setDuration(260).withEndAction(done).start()
  }

  // ── The card ───────────────────────────────────────────────────────────────────

  private fun expand() {
    val s = Snapshot.parse(OverlayStore.snapshot(this)) ?: return
    if (card != null) return
    val shown = s.flagAt(System.currentTimeMillis(), OverlayStore.handled(this))
    // Opening the card answers the pill too; it comes back later if nothing gets logged.
    if (pill?.visibility == View.VISIBLE && shown != null) {
      dismissedFlagId = shown.id
      dismissedAt = System.currentTimeMillis()
    }
    tuckPill(instant = true)
    val view = CardView(this, s, shown, object : CardActions {
      override fun onFlag(flag: Flag) = runFlag(flag)
      override fun onOpenApp() {
        open(s.openUrl)
        collapse()
      }
      override fun onLogMeal(text: String) {
        enqueue(JSONObject().put("kind", "meal_text").put("text", text))
        // A meal logged here answers a meal flag.
        if (shown?.icon == "meal") handle(shown)
        main.postDelayed({ collapse() }, 900)
      }
      override fun onDismiss() = collapse()
    })
    // Full screen: the dim covers the other app, and a tap on it closes the card.
    val params = overlayParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      0,
    ).apply {
      gravity = Gravity.TOP
      softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING
    }
    view.alpha = 0f
    view.body.translationY = -dp(12f)
    wm.addView(view, params)
    view.animate().alpha(1f).setDuration(220).start()
    view.body.animate().translationY(0f).setDuration(280).setInterpolator(DecelerateInterpolator()).start()
    card = view
    bubble?.setBlinking(false)
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

  private fun handle(flag: Flag) {
    OverlayStore.addHandled(this, flag.id)
  }

  /** The flag's prepared step: done in place when it can be, else opened in Halo. */
  private fun runFlag(flag: Flag) {
    handle(flag)
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
    if (hidden) {
      collapse()
      tuckPill(instant = true)
    }
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
    val flag = s.flagAt(now, OverlayStore.handled(this))
    view.flag = flag
    view.setBlinking(!hidden && card == null && flag?.icon != null)
    view.invalidate()
    lastShownFlagId = flag?.id
    // The pill: out while the flag needs them, unless they put it away a little while ago.
    val putAway = flag != null && flag.id == dismissedFlagId && now - dismissedAt < AGAIN_MS
    if (flag != null && !hidden && card == null && !dragging && snap?.isRunning != true && !putAway) {
      showPill(flag, s)
    } else {
      tuckPill(instant = hidden || card != null || dragging)
    }
    if (putAway) main.postDelayed(tick, (dismissedAt + AGAIN_MS - now).coerceAtLeast(1_000))
    // Wake only when a flag starts or ends: no polling.
    s.nextChange(now)?.let { main.postDelayed(tick, (it - now).coerceIn(1_000, 6 * 3_600_000L)) }
  }

  companion object {
    private const val CHANNEL = "overlay"
    private const val NOTIFICATION_ID = 7341
    /** A pill put away comes back after this long if the flag still needs them. */
    private const val AGAIN_MS = 15 * 60_000L

    /** Starts the overlay if it may draw and wasn't dragged away. Returns whether it started. */
    fun start(context: Context): Boolean {
      if (!Settings.canDrawOverlays(context) || OverlayStore.closed(context)) return false
      ContextCompat.startForegroundService(context, Intent(context, OverlayService::class.java))
      return true
    }
  }
}
