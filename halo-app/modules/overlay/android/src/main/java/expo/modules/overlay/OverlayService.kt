package expo.modules.overlay

import android.Manifest
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
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.view.inputmethod.InputMethodManager
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import kotlin.math.hypot

// The floating overlay: a foreground service that keeps Halo's ring over other apps. It reads the
// snapshot Halo last wrote and only shows what the PA already decided; anything logged here goes
// into a queue that Halo drains into its own store and outbox (local-first, nothing waits on it).
// A tap on the ring talks (chunk 27): it puts the alarm away, listens, sends the recording to Halo's
// backend, then shows and speaks the reply and does what it says through the same queue. A
// long-press opens the card.
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
   * away for that flag; it comes back after a while if they still haven't acted, or as soon as they
   * leave Halo without having dealt with it.
   */
  private var dismissedFlagId: String? = null
  private var dismissedAt = 0L
  private var dragging = false
  /** The flag the ring speaks for right now. */
  private var lastShownFlagId: String? = null

  private enum class Voice { IDLE, LISTENING, THINKING, REPLYING }
  private var voice = Voice.IDLE
  private var voicePill: VoicePillView? = null
  private var voicePillParams: WindowManager.LayoutParams? = null
  private var recorder: VoiceRecorder? = null
  private var player: VoicePlayer? = null
  @Volatile private var speaking = false
  /** The alarm the tap put away: the turn is about it, and a matching log answers it. */
  private var voiceFlag: Flag? = null
  /** What the reply on screen logged, for its Undo. */
  private var replyLogs: List<String> = emptyList()
  private var replyNotification = 0
  private val tuckVoice = Runnable { endVoice() }
  private val client by lazy { VoiceClient(this) }

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
    recorder?.stop()
    player?.stop()
    endMic()
    voicePill?.let { runCatching { wm.removeView(it) } }
    voicePill = null
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

  private var notification: Notification? = null

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
    this.notification = notification
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
    addVoicePill()
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
    var longPressed = false
    // A long-press opens the card (typing a meal, the flag's step, Open app).
    val longPress = Runnable {
      if (dragging) return@Runnable
      longPressed = true
      view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
      view.animate().scaleX(1f).scaleY(1f).setDuration(160).start()
      expand()
    }
    view.setOnTouchListener { _, e ->
      when (e.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          snap?.cancel()
          downX = e.rawX
          downY = e.rawY
          startX = params.x
          startY = params.y
          dragging = false
          longPressed = false
          main.postDelayed(longPress, ViewConfiguration.getLongPressTimeout().toLong())
          view.animate().scaleX(0.94f).scaleY(0.94f).setDuration(100).start()
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = e.rawX - downX
          val dy = e.rawY - downY
          if (!dragging && hypot(dx, dy) > slop) {
            dragging = true
            main.removeCallbacks(longPress)
            tuckPill(instant = true)
            tuckVoicePill(instant = true)
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
          main.removeCallbacks(longPress)
          view.animate().scaleX(1f).scaleY(1f).setDuration(160).start()
          if (!dragging) {
            if (e.actionMasked == MotionEvent.ACTION_UP && !longPressed) onRingTap()
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
    // Typing instead: whatever was being said is dropped.
    if (voice != Voice.IDLE) cancelVoice()
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

  /** Queues an entry for Halo and returns its client id (the record id it becomes). */
  private fun enqueue(item: JSONObject): String {
    val id = UUID.randomUUID().toString()
    item.put("clientId", id).put("at", System.currentTimeMillis())
    OverlayStore.enqueue(this, item)
    OverlayBus.onQueued?.invoke()
    return id
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

  // ── The microphone ─────────────────────────────────────────────────────────────

  /**
   * Adds the microphone type to this service while a voice log records (Android 11+ needs the
   * type for mic access from a foreground service). Null when it worked, else what went wrong.
   */
  fun beginMic(): String? {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return "no_permission"
    val n = notification ?: return "no_notification"
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      }
      null
    } catch (e: Exception) {
      "${e.javaClass.simpleName}: ${e.message}"
    }
  }

  /** Back to the overlay's own type once recording ends. */
  fun endMic() {
    val n = notification ?: return
    runCatching {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        startForeground(NOTIFICATION_ID, n)
      }
    }
  }

  // ── Voice ──────────────────────────────────────────────────────────────────────

  private fun addVoicePill() {
    val view = VoicePillView(this)
    val params = overlayParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
    ).apply { gravity = Gravity.TOP or Gravity.START }
    view.undo.setOnClickListener { undoReply() }
    // A tap on the line itself puts it away.
    view.row.setOnClickListener { if (voice == Voice.REPLYING && !speaking) endVoice() }
    wm.addView(view, params)
    voicePill = view
    voicePillParams = params
  }

  /** Dots while listening or thinking (`line` null), else a line, beside the ring like the flag pill. */
  private fun showVoicePill(line: String?, thinking: Boolean = false, canUndo: Boolean = false) {
    val view = voicePill ?: return
    val params = voicePillParams ?: return
    val ring = bubbleParams ?: return
    val s = Snapshot.parse(OverlayStore.snapshot(this)) ?: return
    if (haloOnScreen()) return
    val onRight = ring.x + size / 2 > screenW / 2
    view.bind(s.colors, onRight, size, line, thinking, canUndo)
    view.measure(View.MeasureSpec.UNSPECIFIED, View.MeasureSpec.UNSPECIFIED)
    val w = view.measuredWidth
    val h = view.measuredHeight
    // Its own size, not WRAP_CONTENT: Android first fits a wrapping window to a dialog's width,
    // which squeezed Undo off the end.
    params.width = w
    params.height = h
    params.x = if (onRight) ring.x + size / 2 - w + dpi(4f) else ring.x + size / 2 - dpi(4f)
    params.y = (ring.y + size / 2 - h / 2).coerceAtLeast(0)
    params.flags = params.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
    wm.updateViewLayout(view, params)
    if (view.visibility == View.VISIBLE) {
      // The reply takes the dots' place: its words fade in rather than jump.
      if (line != null) {
        view.text.alpha = 0f
        view.text.animate().alpha(1f).setDuration(200).start()
      }
      return
    }
    val from = (if (onRight) 1 else -1) * (w - size / 2f)
    view.row.animate().cancel()
    view.row.translationX = from
    view.row.alpha = 0f
    view.visibility = View.VISIBLE
    view.row.animate().translationX(0f).alpha(1f).setDuration(340).setInterpolator(DecelerateInterpolator(1.5f)).start()
  }

  private fun tuckVoicePill(instant: Boolean = false) {
    val view = voicePill ?: return
    val params = voicePillParams ?: return
    if (view.visibility != View.VISIBLE) return
    val done = {
      view.visibility = View.INVISIBLE
      params.flags = params.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
      if (view.isAttachedToWindow) wm.updateViewLayout(view, params)
    }
    view.row.animate().cancel()
    if (instant) {
      done()
      return
    }
    val onRight = (bubbleParams?.x ?: 0) + size / 2 > screenW / 2
    val to = (if (onRight) 1 else -1) * (view.width - size / 2f)
    view.row.animate().translationX(to).alpha(0f).setDuration(260).withEndAction(done).start()
  }

  /** A tap on the ring: talk, end the listening early, or stop the speech. */
  private fun onRingTap() {
    when (voice) {
      Voice.IDLE -> startVoice()
      Voice.LISTENING -> recorder?.stop()
      Voice.THINKING -> Unit
      Voice.REPLYING -> if (speaking) player?.stop() else startVoice()
    }
  }

  private fun startVoice() {
    main.removeCallbacks(tuckVoice)
    player?.stop()
    val payload = OverlayStore.voice(this)
    // Not agreed yet (or no mic): Halo asks, then sends them back here.
    if (payload == null || !payload.optBoolean("allowed") || !payload.has("api")) {
      open("haloapp://voice-access?from=ring")
      return
    }
    // The alarm goes away (pill and blink) while they talk; it's back later if nothing gets logged.
    val s = Snapshot.parse(OverlayStore.snapshot(this))
    val flag = s?.flagAt(System.currentTimeMillis(), OverlayStore.handled(this))
    voiceFlag = flag
    if (flag != null) {
      dismissedFlagId = flag.id
      dismissedAt = System.currentTimeMillis()
    }
    tuckPill(instant = true)
    bubble?.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
    when {
      !client.online() -> return voiceLine(VoiceLines.OFFLINE)
      VoicePlayer.onCall(this) -> return voiceLine(VoiceLines.ON_CALL)
    }
    beginMic()?.let { return voiceLine(VoiceLines.FAILED) }
    voice = Voice.LISTENING
    render()
    showVoicePill(null)
    val rec = VoiceRecorder(object : VoiceRecorder.Listener {
      override fun onLevel(level: Float) {
        voicePill?.dots?.level = level
      }

      override fun onDone(result: VoiceRecorder.Result) {
        endMic()
        recorder = null
        Log.i("HaloVoice", "recorded ${result.durationMs} ms, peak ${result.peak}, speech ${result.heardSpeech}, error ${result.error}")
        if (voice != Voice.LISTENING) return
        val wav = result.wav
        if (wav == null || !result.heardSpeech) return voiceLine(VoiceLines.NO_SPEECH)
        voice = Voice.THINKING
        render()
        showVoicePill(null, thinking = true)
        client.send(payload, wav, flag, ::onReply) { line -> if (voice == Voice.THINKING) voiceLine(line) }
      }
    })
    recorder = rec
    rec.start()
  }

  /** Long-press or Halo opening while talking: drop the turn quietly. */
  private fun cancelVoice() {
    voice = Voice.IDLE
    recorder?.stop()
    player?.stop()
    main.removeCallbacks(tuckVoice)
    tuckVoicePill(instant = true)
    render()
  }

  /** A line of its own (no speech): an error, offline, on a call. */
  private fun voiceLine(line: String) {
    voice = Voice.REPLYING
    replyLogs = emptyList()
    render()
    showVoicePill(line)
    main.removeCallbacks(tuckVoice)
    main.postDelayed(tuckVoice, LINE_MS)
  }

  private fun endVoice() {
    voice = Voice.IDLE
    main.removeCallbacks(tuckVoice)
    tuckVoicePill()
    render()
  }

  private fun onReply(reply: VoiceReply) {
    if (voice != Voice.THINKING) return
    val logs = applyActions(reply)
    replyLogs = logs.map { it.first }
    voice = Voice.REPLYING
    render()
    showVoicePill(reply.text, canUndo = logs.isNotEmpty())
    if (logs.isNotEmpty()) notifyLogs(reply, logs)
    speak(reply)
  }

  /**
   * Does what the reply says through Halo's queue, in order: logs, an undo of the last voice logs,
   * opening a screen, then the exchange for today's Advisor thread. Returns the logs (client id,
   * label).
   */
  private fun applyActions(reply: VoiceReply): List<Pair<String, String>> {
    val logs = mutableListOf<Pair<String, String>>()
    val kinds = JSONArray()
    var openUrl: String? = null
    val flag = voiceFlag
    for (i in 0 until reply.actions.length()) {
      val a = reply.actions.optJSONObject(i) ?: continue
      val entry = when (a.optString("kind")) {
        "meal" -> JSONObject().put("kind", "meal_text").put("text", a.optString("description"))
          .put("mealType", if (a.isNull("mealType")) JSONObject.NULL else a.optString("mealType"))
        "water" -> JSONObject().put("kind", "water").put("ml", a.optInt("ml"))
        "weight" -> JSONObject().put("kind", "weight").put("kg", a.optDouble("kg"))
        "undo" -> {
          for (id in OverlayStore.lastVoiceLogs(this)) enqueue(JSONObject().put("kind", "undo").put("targetId", id))
          OverlayStore.setLastVoiceLogs(this, emptyList())
          null
        }
        "open" -> {
          openUrl = VOICE_OPEN_URLS[a.optString("target")]
          null
        }
        else -> null
      } ?: continue
      // A log of the thing the alarm was about answers it.
      val answers = mapOf("meal_text" to "meal", "water" to "water", "weight" to "weight")[entry.optString("kind")]
      if (flag != null && flag.icon == answers) {
        entry.put("briefId", flag.id)
        handle(flag)
      }
      val id = enqueue(entry)
      logs.add(id to a.optString("label").ifEmpty { reply.text })
      kinds.put(JSONObject().put("clientId", id).put("kind", entry.optString("kind")))
    }
    if (logs.isNotEmpty()) OverlayStore.setLastVoiceLogs(this, logs.map { it.first })
    enqueue(
      JSONObject().put("kind", "voice_turn").put("turnId", reply.turnId).put("threadId", reply.threadId)
        .put("heard", reply.heard.ifEmpty { "…" }).put("reply", reply.text).put("logs", kinds),
    )
    // Let the line show first; Halo coming forward hides the ring.
    openUrl?.let { url -> main.postDelayed({ open(url) }, 900) }
    return logs
  }

  /** Each change gets a quiet notification with Undo (the user's call: act, then tell). */
  private fun notifyLogs(reply: VoiceReply, logs: List<Pair<String, String>>) {
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(VOICE_CHANNEL, "Voice logs", NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) },
    )
    val id = reply.turnId.hashCode()
    replyNotification = id
    val undo = Intent(this, VoiceUndoReceiver::class.java)
      .putExtra(VoiceUndoReceiver.IDS, logs.map { it.first }.toTypedArray())
      .putExtra(VoiceUndoReceiver.NOTIFICATION, id)
    val undoIntent = PendingIntent.getBroadcast(this, id, undo, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val open = packageManager.getLaunchIntentForPackage(packageName)
    val tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val icon = resources.getIdentifier("notification_icon", "drawable", packageName).takeIf { it != 0 } ?: applicationInfo.icon
    val notification = Notification.Builder(this, VOICE_CHANNEL)
      .setSmallIcon(icon)
      .setContentTitle(logs.joinToString(" · ") { it.second })
      .setContentText(reply.heard)
      .setContentIntent(tap)
      .setAutoCancel(true)
      .addAction(Notification.Action.Builder(null, "Undo", undoIntent).build())
      .build()
    runCatching { manager.notify(id, notification) }
  }

  private fun undoReply() {
    if (replyLogs.isEmpty()) return
    VoiceUndoReceiver.undo(this, replyLogs, replyNotification)
    replyLogs = emptyList()
    showVoicePill("Taken back.")
    main.removeCallbacks(tuckVoice)
    main.postDelayed(tuckVoice, LINE_MS)
  }

  /** Speaks the reply when the phone allows it (not under DND or on a call); the line stays meanwhile. */
  private fun speak(reply: VoiceReply) {
    main.removeCallbacks(tuckVoice)
    val payload = OverlayStore.voice(this)
    val id = reply.speechId
    if (id == null || payload == null || !VoicePlayer.maySpeak(this)) {
      main.postDelayed(tuckVoice, LINE_MS + reply.text.length * 40L)
      return
    }
    val p = VoicePlayer(this)
    player = p
    speaking = true
    Thread({
      val done = { _: Boolean ->
        speaking = false
        if (voice == Voice.REPLYING) main.postDelayed(tuckVoice, LINE_MS)
      }
      try {
        p.play(client.speech(payload, id), reply.speechRate, done)
      } catch (_: Exception) {
        main.post { done(false) }
      }
    }, "halo-voice-speech").start()
  }

  // ── Rendering ──────────────────────────────────────────────────────────────────

  private fun render() {
    if (destroyed) return
    // The permission was taken back in Settings: nothing to draw, so no service and no notification.
    if (!Settings.canDrawOverlays(this)) {
      stopSelf()
      return
    }
    main.removeCallbacks(tick)
    val view = bubble ?: return
    val params = bubbleParams ?: return
    val s = Snapshot.parse(OverlayStore.snapshot(this))
    val inHalo = haloOnScreen()
    // Opening Halo clears a pill they put away: if the flag still needs them on the way out, it's back.
    if (inHalo) dismissedFlagId = null
    val hidden = inHalo || s == null
    if (hidden) {
      collapse()
      tuckPill(instant = true)
      // Halo came forward (it may have been opened by the reply): the ring's talk ends there.
      if (voice == Voice.LISTENING || voice == Voice.THINKING) cancelVoice() else tuckVoicePill(instant = true)
    }
    view.listening = voice == Voice.LISTENING
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
    // The pill: out while the flag needs them, unless they put it away a little while ago (a tap
    // to talk puts it and its blink away).
    val putAway = flag != null && flag.id == dismissedFlagId && now - dismissedAt < AGAIN_MS
    val talking = voice != Voice.IDLE
    view.setBlinking(!hidden && card == null && flag?.icon != null && !putAway && !talking)
    view.invalidate()
    lastShownFlagId = flag?.id
    if (flag != null && !hidden && card == null && !dragging && snap?.isRunning != true && !putAway && !talking) {
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
    private const val VOICE_CHANNEL = "voice"
    /** How long a reply's line stays after it was said (or shown, when not spoken). */
    private const val LINE_MS = 8_000L

    /** Starts the overlay if it may draw and wasn't dragged away. Returns whether it started. */
    fun start(context: Context): Boolean {
      if (!Settings.canDrawOverlays(context) || OverlayStore.closed(context)) return false
      ContextCompat.startForegroundService(context, Intent(context, OverlayService::class.java))
      return true
    }
  }
}
