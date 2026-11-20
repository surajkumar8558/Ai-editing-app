package com.aiediting.keyboard

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.os.Handler
import android.os.Looper
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView

/** One entry in the suggestion strip. */
data class Suggestion(val text: String, val display: String = text, val highlighted: Boolean = false)

enum class ShiftState { OFF, ON, LOCKED }

/** Callbacks from the keyboard UI to the input method service. */
interface KeyboardActions {
    fun onCharacter(text: String)
    fun onSeparator(text: String)
    fun onDelete()
    fun onEnter()
    fun onShift()
    fun onSwitchKeyboard()
    fun onShowImePicker()
    fun onSuggestionPicked(suggestion: Suggestion)
    fun onOpenAiPanel()
    fun onToneSelected(tone: Tone)
    fun onApplyRewrite()
    fun onCopyRewrite()
    fun onCloseAiPanel()
    fun onOpenSettings()
    fun hapticsEnabled(): Boolean
}

/**
 * Builds the keyboard views in code (no deprecated KeyboardView): a top bar with the AI button and
 * suggestions, and either the key grid or the AI rewrite panel below it.
 */
@SuppressLint("SetTextI18n", "ViewConstructor")
class KeyboardUi(private val context: Context, private val actions: KeyboardActions) {

    private val dark = (context.resources.configuration.uiMode and
        Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    private val colBackground = if (dark) 0xFF1E1F22.toInt() else 0xFFE4E6EB.toInt()
    private val colKey = if (dark) 0xFF3A3B3F.toInt() else Color.WHITE
    private val colKeyPressed = if (dark) 0xFF55565B.toInt() else 0xFFC9CCD3.toInt()
    private val colSpecialKey = if (dark) 0xFF2B2C30.toInt() else 0xFFBFC3CC.toInt()
    private val colText = if (dark) 0xFFF1F1F1.toInt() else 0xFF202124.toInt()
    private val colSubText = if (dark) 0xFFAAAAAA.toInt() else 0xFF5F6368.toInt()
    private val colAccent = 0xFF5B5BD6.toInt()

    val root: LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundColor(colBackground)
        setPadding(dp(3), dp(2), dp(3), dp(4))
    }

    private val suggestionBar = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
    private val content = FrameLayout(context)
    private val keysContainer = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    private val aiPanel = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }

    private var symbols = false
    private var shift = ShiftState.OFF
    private val letterKeys = ArrayList<Pair<TextView, String>>()
    private var shiftKey: TextView? = null
    private var enterKey: TextView? = null
    private var enterLabel = "⏎"

    // AI panel widgets
    private val toneButtons = LinkedHashMap<Tone, TextView>()
    private val resultView = TextView(context)
    private val statusView = TextView(context)
    private val progress = ProgressBar(context)
    private val applyButton = Button(context)
    private val copyButton = Button(context)
    private val settingsButton = Button(context)

    private val handler = Handler(Looper.getMainLooper())

    init {
        root.addView(buildTopBar(), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(44)))
        content.addView(keysContainer, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        content.addView(aiPanel, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, keysHeight()))
        aiPanel.visibility = View.GONE
        root.addView(content)
        buildAiPanel()
        buildKeys()
    }

    // ---------------------------------------------------------------- top bar & suggestions

    private fun buildTopBar(): View {
        val bar = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val ai = TextView(context).apply {
            text = "✨ AI"
            setTextColor(Color.WHITE)
            setTypeface(typeface, Typeface.BOLD)
            textSize = 14f
            gravity = Gravity.CENTER
            background = pill(colAccent, 0xFF4646B8.toInt())
            setPadding(dp(14), 0, dp(14), 0)
            contentDescription = "Fix grammar and change tone with AI"
            setOnClickListener { tap(it); actions.onOpenAiPanel() }
        }
        bar.addView(ai, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(34)).apply {
            marginStart = dp(4); marginEnd = dp(6)
        })
        bar.addView(suggestionBar, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f))
        return bar
    }

    fun setSuggestions(list: List<Suggestion>) {
        suggestionBar.removeAllViews()
        list.forEachIndexed { index, s ->
            if (index > 0) {
                suggestionBar.addView(View(context).apply { setBackgroundColor(colSubText and 0x55FFFFFF) },
                    LinearLayout.LayoutParams(dp(1), dp(20)).apply { gravity = Gravity.CENTER_VERTICAL })
            }
            val tv = TextView(context).apply {
                text = s.display
                textSize = 16f
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.END
                gravity = Gravity.CENTER
                setTextColor(if (s.highlighted) colAccent else colText)
                if (s.highlighted) setTypeface(typeface, Typeface.BOLD)
                background = pill(Color.TRANSPARENT, colKeyPressed)
                setOnClickListener { tap(it); actions.onSuggestionPicked(s) }
            }
            suggestionBar.addView(tv, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f))
        }
    }

    // ---------------------------------------------------------------- keys

    private sealed class Key(val weight: Float) {
        class Char(val value: String, weight: Float = 1f) : Key(weight)
        class Sep(val value: String, weight: Float = 1f) : Key(weight)
        class Special(val label: String, val action: String, weight: Float) : Key(weight)
        class Gap(weight: Float) : Key(weight)
    }

    private fun letterRows(): List<List<Key>> = listOf(
        "qwertyuiop".map { Key.Char(it.toString()) },
        listOf(Key.Gap(0.5f)) + "asdfghjkl".map { Key.Char(it.toString()) } + listOf(Key.Gap(0.5f)),
        listOf(Key.Special("⇧", "shift", 1.5f)) + "zxcvbnm".map { Key.Char(it.toString()) } +
            listOf(Key.Special("⌫", "delete", 1.5f)),
        listOf(
            Key.Special("?123", "symbols", 1.5f), Key.Sep(","), Key.Special("🌐", "globe", 1f),
            Key.Special("space", "space", 4f), Key.Sep("."), Key.Special("⏎", "enter", 1.5f),
        ),
    )

    private fun symbolRows(): List<List<Key>> = listOf(
        "1234567890".map { Key.Char(it.toString()) },
        listOf("@", "#", "$", "%", "&", "-", "+", "(", ")", "/").map { Key.Char(it) },
        listOf(Key.Char("*", 1f), Key.Char("\"", 1f), Key.Char("'", 1f), Key.Sep(":"), Key.Sep(";"),
            Key.Sep("!"), Key.Sep("?"), Key.Char("_", 1f), Key.Char("=", 1f), Key.Special("⌫", "delete", 1.5f)),
        listOf(
            Key.Special("ABC", "letters", 1.5f), Key.Sep(","), Key.Special("🌐", "globe", 1f),
            Key.Special("space", "space", 4f), Key.Sep("."), Key.Special("⏎", "enter", 1.5f),
        ),
    )

    private fun buildKeys() {
        keysContainer.removeAllViews()
        letterKeys.clear()
        shiftKey = null
        enterKey = null
        val rows = if (symbols) symbolRows() else letterRows()
        for (row in rows) {
            val rowView = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
            for (key in row) {
                val lp = LinearLayout.LayoutParams(0, dp(KEY_HEIGHT_DP), key.weight)
                if (key is Key.Gap) {
                    rowView.addView(View(context), lp)
                    continue
                }
                lp.setMargins(dp(3), dp(4), dp(3), dp(4))
                rowView.addView(createKeyView(key), lp)
            }
            keysContainer.addView(rowView)
        }
        applyShiftToLabels()
        enterKey?.text = enterLabel
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun createKeyView(key: Key): TextView {
        val tv = TextView(context).apply {
            gravity = Gravity.CENTER
            setTextColor(colText)
            textSize = 20f
            isClickable = true
        }
        when (key) {
            is Key.Char -> {
                tv.text = key.value
                tv.background = pill(colKey, colKeyPressed)
                if (key.value.length == 1 && key.value[0].isLetter()) letterKeys += tv to key.value
                tv.setOnClickListener {
                    tap(it)
                    val out = if (shift != ShiftState.OFF) key.value.uppercase() else key.value
                    actions.onCharacter(out)
                }
            }
            is Key.Sep -> {
                tv.text = key.value
                tv.background = pill(colKey, colKeyPressed)
                tv.setOnClickListener { tap(it); actions.onSeparator(key.value) }
            }
            is Key.Special -> {
                tv.text = key.label
                tv.textSize = if (key.label.length > 2) 14f else 20f
                tv.background = pill(if (key.action == "space") colKey else colSpecialKey, colKeyPressed)
                when (key.action) {
                    "shift" -> {
                        shiftKey = tv
                        tv.setOnClickListener { tap(it); actions.onShift() }
                    }
                    "delete" -> setupRepeatingDelete(tv)
                    "symbols" -> tv.setOnClickListener { tap(it); symbols = true; buildKeys() }
                    "letters" -> tv.setOnClickListener { tap(it); symbols = false; buildKeys() }
                    "globe" -> {
                        tv.textSize = 16f
                        tv.setOnClickListener { tap(it); actions.onSwitchKeyboard() }
                        tv.setOnLongClickListener { actions.onShowImePicker(); true }
                    }
                    "space" -> {
                        tv.text = "English"
                        tv.setTextColor(colSubText)
                        tv.setOnClickListener { tap(it); actions.onSeparator(" ") }
                        tv.setOnLongClickListener { actions.onShowImePicker(); true }
                    }
                    "enter" -> {
                        enterKey = tv
                        tv.background = pill(colAccent, 0xFF4646B8.toInt())
                        tv.setTextColor(Color.WHITE)
                        tv.setOnClickListener { tap(it); actions.onEnter() }
                    }
                }
            }
            is Key.Gap -> Unit
        }
        return tv
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun setupRepeatingDelete(view: View) {
        val repeat = object : Runnable {
            override fun run() {
                actions.onDelete()
                handler.postDelayed(this, 50)
            }
        }
        view.setOnTouchListener { v, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    v.isPressed = true
                    tap(v)
                    actions.onDelete()
                    handler.postDelayed(repeat, 400)
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    v.isPressed = false
                    handler.removeCallbacks(repeat)
                }
            }
            true
        }
    }

    fun setShift(state: ShiftState) {
        shift = state
        applyShiftToLabels()
    }

    private fun applyShiftToLabels() {
        val upper = shift != ShiftState.OFF
        for ((tv, value) in letterKeys) tv.text = if (upper) value.uppercase() else value
        shiftKey?.apply {
            text = if (shift == ShiftState.LOCKED) "⇪" else "⇧"
            setTextColor(if (shift == ShiftState.OFF) colText else colAccent)
        }
    }

    fun setEnterLabel(label: String) {
        enterLabel = label
        enterKey?.text = label
        enterKey?.textSize = if (label.length > 2) 14f else 20f
    }

    fun resetToLetters() {
        if (symbols) {
            symbols = false
            buildKeys()
        }
    }

    // ---------------------------------------------------------------- AI panel

    private fun buildAiPanel() {
        aiPanel.setPadding(dp(6), dp(4), dp(6), dp(4))

        val tones = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
        for (tone in Tone.entries) {
            val chip = TextView(context).apply {
                text = tone.label
                textSize = 14f
                gravity = Gravity.CENTER
                setPadding(dp(14), 0, dp(14), 0)
                setOnClickListener { tap(it); actions.onToneSelected(tone) }
            }
            toneButtons[tone] = chip
            tones.addView(chip, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(34)).apply {
                marginEnd = dp(6)
            })
        }
        val toneScroll = HorizontalScrollView(context).apply {
            isHorizontalScrollBarEnabled = false
            addView(tones)
        }
        aiPanel.addView(toneScroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        val card = FrameLayout(context).apply {
            background = rounded(colKey)
            setPadding(dp(12), dp(10), dp(12), dp(10))
        }
        resultView.apply {
            setTextColor(colText)
            textSize = 16f
            setTextIsSelectable(true)
        }
        val scroll = ScrollView(context).apply { addView(resultView) }
        card.addView(scroll, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        val statusBox = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }
        statusView.apply {
            setTextColor(colSubText)
            textSize = 14f
            gravity = Gravity.CENTER
        }
        statusBox.addView(progress, LinearLayout.LayoutParams(dp(32), dp(32)))
        statusBox.addView(statusView)
        settingsButton.apply {
            text = "Open settings"
            isAllCaps = false
            visibility = View.GONE
            setOnClickListener { actions.onOpenSettings() }
        }
        statusBox.addView(settingsButton)
        card.addView(statusBox, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        aiPanel.addView(card, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f).apply {
            topMargin = dp(6); bottomMargin = dp(6)
        })

        val buttons = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
        val back = actionButton("⌨ Keyboard", colSpecialKey, colText) { actions.onCloseAiPanel() }
        styleAction(copyButton, "Copy", colSpecialKey, colText) { actions.onCopyRewrite() }
        styleAction(applyButton, "Replace text", colAccent, Color.WHITE) { actions.onApplyRewrite() }
        buttons.addView(back, LinearLayout.LayoutParams(0, dp(42), 1f).apply { marginEnd = dp(6) })
        buttons.addView(copyButton, LinearLayout.LayoutParams(0, dp(42), 0.8f).apply { marginEnd = dp(6) })
        buttons.addView(applyButton, LinearLayout.LayoutParams(0, dp(42), 1.4f))
        aiPanel.addView(buttons)
    }

    private fun actionButton(label: String, bg: Int, fg: Int, onClick: () -> Unit): TextView =
        TextView(context).also { styleAction(it, label, bg, fg, onClick) }

    private fun styleAction(view: TextView, label: String, bg: Int, fg: Int, onClick: () -> Unit) {
        view.text = label
        view.isAllCaps = false
        view.textSize = 15f
        view.gravity = Gravity.CENTER
        view.setTextColor(fg)
        view.background = pill(bg, colKeyPressed)
        view.minHeight = 0
        view.minimumHeight = 0
        view.stateListAnimator = null
        view.setOnClickListener { tap(it); onClick() }
    }

    fun showAiPanel() {
        keysContainer.visibility = View.INVISIBLE
        aiPanel.visibility = View.VISIBLE
        suggestionBar.visibility = View.INVISIBLE
    }

    fun showKeys() {
        aiPanel.visibility = View.GONE
        keysContainer.visibility = View.VISIBLE
        suggestionBar.visibility = View.VISIBLE
    }

    val isAiPanelVisible: Boolean get() = aiPanel.visibility == View.VISIBLE

    fun setSelectedTone(tone: Tone?) {
        for ((t, chip) in toneButtons) {
            val selected = t == tone
            chip.background = pill(if (selected) colAccent else colKey, colKeyPressed)
            chip.setTextColor(if (selected) Color.WHITE else colText)
        }
    }

    fun showAiLoading(tone: Tone) {
        setSelectedTone(tone)
        resultView.text = ""
        progress.visibility = View.VISIBLE
        statusView.text = "Writing a ${tone.label.lowercase()} version…"
        settingsButton.visibility = View.GONE
        setActionsEnabled(false)
    }

    fun showAiResult(text: String) {
        progress.visibility = View.GONE
        statusView.text = ""
        settingsButton.visibility = View.GONE
        resultView.text = text
        setActionsEnabled(true)
    }

    fun showAiMessage(message: String, offerSettings: Boolean = false) {
        progress.visibility = View.GONE
        resultView.text = ""
        statusView.text = message
        settingsButton.visibility = if (offerSettings) View.VISIBLE else View.GONE
        setActionsEnabled(false)
    }

    private fun setActionsEnabled(enabled: Boolean) {
        for (b in listOf(applyButton, copyButton)) {
            b.isEnabled = enabled
            b.alpha = if (enabled) 1f else 0.4f
        }
    }

    // ---------------------------------------------------------------- helpers

    private fun tap(v: View) {
        if (actions.hapticsEnabled()) v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
    }

    private fun keysHeight(): Int = 4 * (dp(KEY_HEIGHT_DP) + dp(8))

    private fun rounded(color: Int): GradientDrawable = GradientDrawable().apply {
        cornerRadius = dp(8).toFloat()
        setColor(color)
    }

    private fun pill(normal: Int, pressed: Int): StateListDrawable = StateListDrawable().apply {
        addState(intArrayOf(android.R.attr.state_pressed), rounded(pressed))
        addState(intArrayOf(), rounded(normal))
    }

    private fun dp(v: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), context.resources.displayMetrics).toInt()

    companion object {
        private const val KEY_HEIGHT_DP = 46
    }
}
