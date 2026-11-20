package com.aiediting.keyboard

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast

/** Launcher screen: setup steps, Claude API key, keyboard options and a test field. */
class SettingsActivity : Activity() {

    private lateinit var prefs: Prefs
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)

        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(24), dp(20), dp(32))
        }

        column.addView(text("AI Editing Keyboard", 26f, bold = true))
        column.addView(text(
            "Auto-correct while you type, then tap ✨ AI on the keyboard to get a grammar-corrected " +
                "version or rewrite your message as Professional, Casual, Polite or Authoritative — " +
                "without leaving the app you're typing in.", 15f,
        ).withTopMargin(8))

        // Step 1 & 2: enable and select the keyboard.
        column.addView(header("1. Turn on the keyboard"))
        status = text("", 14f)
        column.addView(status)
        column.addView(button("Enable in system settings") {
            startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
        })
        column.addView(header("2. Switch to it"))
        column.addView(button("Choose keyboard") {
            (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showInputMethodPicker()
        })

        // Step 3: API key.
        column.addView(header("3. Add your Claude API key"))
        column.addView(text(
            "The ✨ AI rewrite uses the Claude API. Create a key at console.anthropic.com and paste it " +
                "below. It is stored only on this device, and text is sent to the API only when you tap ✨ AI.",
            14f,
        ))
        val keyField = EditText(this).apply {
            hint = "sk-ant-…"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setSingleLine()
            setText(prefs.apiKey)
        }
        column.addView(keyField, matchWrap().withTop(8))
        column.addView(button("Save API key") {
            prefs.apiKey = keyField.text.toString()
            Toast.makeText(this, if (prefs.apiKey.isEmpty()) "API key removed" else "API key saved", Toast.LENGTH_SHORT).show()
        })

        // Options.
        column.addView(header("Options"))
        column.addView(switch("Auto-correct", prefs.autocorrect) { prefs.autocorrect = it })
        column.addView(switch("Auto-capitalize sentences", prefs.autoCapitalize) { prefs.autoCapitalize = it })
        column.addView(switch("Vibrate on key press", prefs.vibrate) { prefs.vibrate = it })
        column.addView(button("Clear learned words") {
            prefs.learnedWords = emptySet()
            Toast.makeText(this, "Learned words cleared (applies next time the keyboard starts)", Toast.LENGTH_SHORT).show()
        })

        // Try it.
        column.addView(header("Try it"))
        column.addView(text("Type something with mistakes, e.g. \"i dont thinks teh report are ready\", then tap ✨ AI.", 14f))
        column.addView(EditText(this).apply {
            hint = "Type here to test the keyboard"
            minLines = 3
            gravity = Gravity.TOP
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
        }, matchWrap().withTop(8))

        setContentView(ScrollView(this).apply {
            fitsSystemWindows = true
            addView(column)
        })
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) refreshStatus() // the IME picker dialog doesn't trigger onResume
    }

    private fun refreshStatus() {
        val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        val enabled = imm.enabledInputMethodList.any { it.packageName == packageName }
        val current = Settings.Secure.getString(contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD).orEmpty()
        val selected = current.startsWith("$packageName/")
        status.text = when {
            selected -> "✅ Enabled and selected — you're all set."
            enabled -> "✅ Enabled. Now switch to it (step 2)."
            else -> "⚠️ Not enabled yet. Turn on \"AI Editing Keyboard\" in the list."
        }
    }

    // ---------------------------------------------------------------- tiny view helpers

    private fun text(value: String, size: Float, bold: Boolean = false) = TextView(this).apply {
        text = value
        textSize = size
        if (bold) setTypeface(typeface, Typeface.BOLD)
    }

    private fun header(value: String) = text(value, 18f, bold = true).withTopMargin(28)

    private fun button(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        setOnClickListener { onClick() }
        layoutParams = matchWrap().withTop(8)
    }

    @Suppress("DEPRECATION")
    private fun switch(label: String, checked: Boolean, onChange: (Boolean) -> Unit) = Switch(this).apply {
        text = label
        textSize = 16f
        isChecked = checked
        setPadding(0, dp(10), 0, dp(10))
        setOnCheckedChangeListener { _, value -> onChange(value) }
    }

    private fun TextView.withTopMargin(top: Int): TextView = apply { layoutParams = matchWrap().withTop(top) }

    private fun matchWrap() = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)

    private fun LinearLayout.LayoutParams.withTop(top: Int) = apply { topMargin = dp(top) }

    private fun dp(v: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()
}
