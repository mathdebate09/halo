package expo.modules.overlay

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewOutlineProvider
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.graphics.PathParser

// The overlay's two faces, drawn natively in Halo's fonts and the current theme's colors: the
// collapsed ring with the overall score, and the card with the three scores, the one flag and a
// line to log a meal. Copy stays minimal, like the app.

internal fun Context.dp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics)
internal fun Context.dpi(v: Float) = dp(v).toInt()

internal object Fonts {
  private val cache = mutableMapOf<String, Typeface>()
  private fun load(c: Context, file: String, fallback: Typeface) =
    cache.getOrPut(file) { runCatching { Typeface.createFromAsset(c.assets, "fonts/$file") }.getOrDefault(fallback) }

  fun serif(c: Context) = load(c, "InstrumentSerif_400Regular.ttf", Typeface.SERIF)
  fun sans(c: Context) = load(c, "InclusiveSans_400Regular.ttf", Typeface.SANS_SERIF)
  fun medium(c: Context) = load(c, "InclusiveSans_500Medium.ttf", Typeface.DEFAULT_BOLD)
}

/** The app's own line icons (src/components/icons.tsx), same paths on the same 24 grid. */
internal object Icons {
  private val DATA = mapOf(
    "meal" to "M3.5 12h17a8.5 8.5 0 0 1-17 0zM9 8.5c0-1.5 1-2 1-3.5M13.5 8.5c0-1.5 1-2 1-3.5",
    "water" to "M5.5 4h13l-1.6 15.2a1.5 1.5 0 0 1-1.5 1.3H8.6a1.5 1.5 0 0 1-1.5-1.3zM6.4 9.5c2.4-1 4.2 1 5.6 0s3.2-1 5.6 0",
    "sleep" to "M19.5 14.6A7.5 7.5 0 1 1 9.4 4.5a6 6 0 0 0 10.1 10.1z",
    "vitals" to "M12 21v-9.5M12 11.5c0-3.6 2.6-6 6.5-6 0 3.6-2.6 6-6.5 6zM12 14.5c0-3-2.2-5-5.5-5 0 3 2.2 5 5.5 5z",
    "weight" to "M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5zM9 9.5a4.2 4.2 0 0 1 6 0M12 11l1.2-1.6",
    "activity" to "M12 21a5.5 5.5 0 0 1-5.5-5.5c0-2.6 1.6-4.2 2.9-5.6.2 1.6 1 2.6 2.1 3 0-3.4 1.2-6.3 3.4-8.4.2 2.8 1.4 4.6 2.6 6.2.9 1.2 1.5 2.6 1.5 4.3A5.5 5.5 0 0 1 12 21z",
    "report" to "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  )
  private val cache = mutableMapOf<String, Path>()

  fun path(name: String): Path? =
    DATA[name]?.let { d -> cache.getOrPut(name) { PathParser.createPathFromPathData(d) } }
}

private fun withAlpha(color: Int, alpha: Float) =
  Color.argb((alpha * 255).toInt(), Color.red(color), Color.green(color), Color.blue(color))

/**
 * The collapsed bubble: a glass disc, the halo ring and the overall score. When the PA needs
 * something (a meal, water, a reading), a dot shows and the icon of that thing blinks in place of
 * the score every few seconds, like a notification light; otherwise it stays still.
 */
@SuppressLint("ViewConstructor")
class BubbleView(context: Context) : View(context) {
  var snapshot: Snapshot? = null
  var flag: Flag? = null

  /** 0 = the score, 1 = the icon. */
  private var phase = 0f
  private var blinking = false
  private var fade: ValueAnimator? = null
  private val steps = mutableListOf<Runnable>()
  private val blink = Runnable { blinkOnce() }
  private val icon = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
    strokeJoin = Paint.Join.ROUND
  }

  /** Blinks while a flag with an icon needs the user and the ring is showing; else rests on the score. */
  fun setBlinking(on: Boolean) {
    if (on == blinking) return
    blinking = on
    stopBlink()
    if (on) postDelayed(blink, FIRST_BLINK_MS)
  }

  private fun stopBlink() {
    removeCallbacks(blink)
    steps.forEach { removeCallbacks(it) }
    steps.clear()
    fade?.cancel()
    fade = null
    phase = 0f
    invalidate()
  }

  private fun fadeTo(to: Float) {
    fade?.cancel()
    fade = ValueAnimator.ofFloat(phase, to).apply {
      duration = SNAP_MS
      addUpdateListener {
        phase = it.animatedValue as Float
        invalidate()
      }
      start()
    }
  }

  /** On, off, on, off (a double blink), then rest until the next one. */
  private fun blinkOnce() {
    steps.clear()
    var at = 0L
    for ((to, hold) in BLINK) {
      val step = Runnable { fadeTo(to) }
      steps.add(step)
      postDelayed(step, at)
      at += SNAP_MS + hold
    }
    postDelayed(blink, EVERY_MS)
  }

  /** A short sideways wiggle (a turn and back), when a flag starts and every so often while it's open. */
  fun wiggle() {
    animate().cancel()
    ObjectAnimator.ofFloat(this, "rotation", 0f, -10f, 9f, -6f, 4f, 0f).apply {
      duration = 420
      start()
    }
  }

  override fun onDetachedFromWindow() {
    blinking = false
    stopBlink()
    super.onDetachedFromWindow()
  }

  private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
  private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val number = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER }
  private val dot = Paint(Paint.ANTI_ALIAS_FLAG)
  private val oval = RectF()

  init {
    elevation = context.dp(6f)
    outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) {
        val inset = context.dpi(4f)
        outline.setOval(inset, inset, view.width - inset, view.height - inset)
      }
    }
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
  }

  override fun onDraw(canvas: Canvas) {
    val s = snapshot ?: return
    val c = s.colors
    val inset = context.dp(4f)
    val cx = width / 2f
    val cy = height / 2f
    val r = width / 2f - inset
    fill.color = withAlpha(c.surface, 0.96f)
    canvas.drawCircle(cx, cy, r, fill)
    // The halo: a flat ring like the app's mark.
    ring.color = withAlpha(c.text, 0.35f)
    ring.strokeWidth = context.dp(1.5f)
    oval.set(cx - r + context.dp(5f), cy - r * 0.62f, cx + r - context.dp(5f), cy + r * 0.62f)
    canvas.drawOval(oval, ring)
    // The score and the icon trade places with a quick fade (a blink, not a drift).
    val path = flag?.icon?.let { Icons.path(it) }
    val showIcon = if (path == null) 0f else phase
    if (showIcon < 1f) {
      number.color = withAlpha(c.text, 1f - showIcon)
      number.typeface = Fonts.serif(context)
      number.textSize = context.dp(24f)
      val baseline = cy - (number.descent() + number.ascent()) / 2
      canvas.drawText(s.overall.toString(), cx, baseline, number)
    }
    if (path != null && showIcon > 0f) {
      val f = flag!!
      val size = context.dp(26f)
      icon.color = withAlpha(if (f.critical) c.alert else c.text, showIcon)
      icon.strokeWidth = 1.5f
      canvas.save()
      canvas.translate(cx - size / 2, cy - size / 2)
      canvas.scale(size / 24f, size / 24f)
      canvas.drawPath(path, icon)
      canvas.restore()
    }
    flag?.let {
      dot.color = c.bg
      val dx = cx + r * 0.68f
      val dy = cy - r * 0.68f
      canvas.drawCircle(dx, dy, context.dp(6.5f), dot)
      dot.color = if (it.critical) c.alert else c.accent
      canvas.drawCircle(dx, dy, context.dp(4.5f), dot)
    }
    contentDescription = buildString {
      append("Halo, overall ${s.overall}")
      flag?.let { append(". ${it.title}") }
    }
  }

  private companion object {
    const val FIRST_BLINK_MS = 1200L
    const val EVERY_MS = 5000L
    const val SNAP_MS = 120L
    /** Each step: show the icon (1) or the score (0), then hold this long. */
    val BLINK = listOf(1f to 450L, 0f to 180L, 1f to 450L, 0f to 0L)
  }
}

/** Shown at the bottom while dragging: let go over it to hide the overlay until Halo opens again. */
@SuppressLint("ViewConstructor")
class CloseTarget(context: Context) : View(context) {
  var hot = false
    set(value) {
      if (field != value) {
        field = value
        animate().scaleX(if (value) 1.15f else 1f).scaleY(if (value) 1.15f else 1f).setDuration(160).start()
        invalidate()
      }
    }
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
  private val cross = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
    color = Color.WHITE
  }

  override fun onDraw(canvas: Canvas) {
    val cx = width / 2f
    val cy = height / 2f
    fill.color = if (hot) Color.argb(235, 40, 40, 40) else Color.argb(170, 20, 20, 20)
    canvas.drawCircle(cx, cy, width / 2f, fill)
    cross.strokeWidth = context.dp(2f)
    val a = context.dp(8f)
    canvas.drawLine(cx - a, cy - a, cx + a, cy + a, cross)
    canvas.drawLine(cx + a, cy - a, cx - a, cy + a, cross)
  }
}

/**
 * The pill that slides out from behind the ring toward the middle of the screen when the PA needs
 * something ("Dinner time"); a tap opens the card. Its inner end tucks under the ring.
 */
@SuppressLint("ViewConstructor")
class PillView(context: Context) : FrameLayout(context) {
  val label = TextView(context).apply {
    typeface = Fonts.medium(context)
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
    maxLines = 1
    ellipsize = android.text.TextUtils.TruncateAt.END
    gravity = Gravity.CENTER_VERTICAL
    maxWidth = context.dpi(230f)
    elevation = context.dp(4f)
    isClickable = true
  }

  init {
    clipChildren = false
    setPadding(context.dpi(4f), 0, context.dpi(4f), 0)
    addView(label, LayoutParams(LayoutParams.WRAP_CONTENT, context.dpi(44f), Gravity.CENTER_VERTICAL))
    visibility = INVISIBLE
  }

  fun bind(flag: Flag, c: Palette, ringOnRight: Boolean, ringSize: Int) {
    label.text = flag.title
    label.contentDescription = "${flag.title}. Opens Halo's card."
    label.setTextColor(if (flag.critical) c.alert else c.text)
    val inner = ringSize / 2 + context.dpi(10f)
    val outer = context.dpi(16f)
    if (ringOnRight) label.setPadding(outer, 0, inner, 0) else label.setPadding(inner, 0, outer, 0)
    label.background = GradientDrawable().apply {
      cornerRadius = context.dp(999f)
      setColor(withAlpha(c.surface, 0.97f))
      setStroke(context.dpi(1f), withAlpha(c.text, 0.12f))
    }
  }
}

/** What the card can do; the service carries each out. */
interface CardActions {
  fun onFlag(flag: Flag)
  fun onOpenApp()
  fun onLogMeal(text: String)
  fun onDismiss()
}

/** The expanded card. Back and a tap outside close it. */
@SuppressLint("ViewConstructor")
class CardView(context: Context, private val snapshot: Snapshot, private val flag: Flag?, private val actions: CardActions) :
  FrameLayout(context) {

  private val c = snapshot.colors
  /** The card itself (it eases in over the dim). */
  lateinit var body: View

  private fun text(size: Float, color: Int, font: Typeface, value: String) = TextView(context).apply {
    setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
    setTextColor(color)
    typeface = font
    text = value
    includeFontPadding = false
  }

  private fun pill(label: String, solid: Boolean, onTap: () -> Unit) = text(15f, if (solid) c.bg else c.text, Fonts.medium(context), label).apply {
    gravity = Gravity.CENTER
    setPadding(context.dpi(18f), context.dpi(10f), context.dpi(18f), context.dpi(10f))
    background = GradientDrawable().apply {
      cornerRadius = context.dp(999f)
      setColor(if (solid) c.text else withAlpha(c.text, 0.1f))
    }
    setOnClickListener { onTap() }
  }

  private fun lp(top: Float = 0f) = LinearLayout.LayoutParams(
    LinearLayout.LayoutParams.MATCH_PARENT,
    LinearLayout.LayoutParams.WRAP_CONTENT,
  ).apply { topMargin = context.dpi(top) }

  init {
    // The overlay's own full-screen layer: a soft dim over the other app; a tap on it closes.
    setBackgroundColor(Color.argb(92, 0, 0, 0))
    setOnClickListener { actions.onDismiss() }
    val body = LinearLayout(context).apply {
      isClickable = true
      orientation = LinearLayout.VERTICAL
      setPadding(context.dpi(20f), context.dpi(18f), context.dpi(20f), context.dpi(18f))
      background = GradientDrawable().apply {
        cornerRadius = context.dp(24f)
        setColor(c.surface)
        setStroke(context.dpi(1f), withAlpha(c.text, 0.12f))
      }
      elevation = context.dp(8f)
    }

    // The overall, then the three parts.
    val scores = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      addView(text(40f, c.text, Fonts.serif(context), snapshot.overall.toString()))
      addView(
        text(14f, c.muted, Fonts.sans(context), "Diet ${snapshot.diet}  ·  Activity ${snapshot.activity}  ·  Vitals ${snapshot.vitals}").apply {
          setPadding(context.dpi(14f), 0, 0, 0)
        },
      )
    }
    body.addView(scores, lp())

    if (flag != null) {
      body.addView(text(22f, if (flag.critical) c.alert else c.text, Fonts.serif(context), flag.title), lp(14f))
      body.addView(text(15f, withAlpha(c.text, 0.85f), Fonts.sans(context), flag.line).apply { setLineSpacing(0f, 1.25f) }, lp(6f))
    }

    val buttons = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
    if (flag?.actionLabel != null && (flag.quick != null || flag.url != null)) {
      buttons.addView(pill(flag.actionLabel, true) { actions.onFlag(flag) })
      buttons.addView(View(context), LinearLayout.LayoutParams(context.dpi(8f), 1))
    }
    buttons.addView(pill("Open app", false) { actions.onOpenApp() })
    body.addView(buttons, lp(16f))

    // A meal in words, logged without opening Halo.
    val row = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      background = GradientDrawable().apply {
        cornerRadius = context.dp(999f)
        setColor(withAlpha(c.text, 0.06f))
        setStroke(context.dpi(1f), withAlpha(c.text, 0.12f))
      }
      setPadding(context.dpi(16f), context.dpi(4f), context.dpi(4f), context.dpi(4f))
    }
    lateinit var send: TextView
    val input = EditText(context).apply {
      hint = "What did you eat?"
      setHintTextColor(c.muted)
      setTextColor(c.text)
      typeface = Fonts.sans(context)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      background = null
      setPadding(0, context.dpi(8f), 0, context.dpi(8f))
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
      imeOptions = EditorInfo.IME_ACTION_SEND
      maxLines = 3
    }
    fun submit() {
      val value = input.text.toString().trim()
      if (value.isEmpty()) return
      actions.onLogMeal(value)
      input.setText("")
      send.text = "Logged"
    }
    send = pill("Log", true) { submit() }.apply { alpha = 0.4f }
    input.addTextChangedListener(object : TextWatcher {
      override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
      override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
      override fun afterTextChanged(s: Editable?) {
        send.alpha = if (s.isNullOrBlank()) 0.4f else 1f
        if (!s.isNullOrBlank()) send.text = "Log"
      }
    })
    input.setOnEditorActionListener { _, id, _ ->
      if (id == EditorInfo.IME_ACTION_SEND) submit()
      true
    }
    row.addView(input, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    row.addView(send)
    body.addView(row, lp(14f))

    addView(body, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.TOP).apply {
      val m = context.dpi(12f)
      setMargins(m, context.dpi(52f), m, m)
    })
    this.body = body
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (event.keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
      actions.onDismiss()
      return true
    }
    return super.dispatchKeyEvent(event)
  }
}
