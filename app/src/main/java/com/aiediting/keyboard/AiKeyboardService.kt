package com.aiediting.keyboard

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.inputmethodservice.InputMethodService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.ExtractedTextRequest
import android.view.inputmethod.InputMethodManager
import android.widget.Toast
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * The keyboard itself: typing, auto-correct, suggestions, and the AI rewrite panel
 * (fix grammar / professional / casual / polite / authoritative).
 */
class AiKeyboardService : InputMethodService(), KeyboardActions {

    private lateinit var prefs: Prefs
    private val corrector = AutoCorrector()
    @Volatile private var dictionaryReady = false

    private val worker: ExecutorService = Executors.newSingleThreadExecutor()
    private val aiWorker: ExecutorService = Executors.newCachedThreadPool()
    private val main = Handler(Looper.getMainLooper())

    private var ui: KeyboardUi? = null
    private var shift = ShiftState.OFF
    private var lastShiftTap = 0L

    /** Whether auto-correct/suggestions apply to the current field (off for passwords, URLs, ...). */
    private var correctionAllowed = true
    private var autoCapAllowed = true

    /** Last auto-correction, so that an immediate backspace can undo it. */
    private data class Correction(val original: String, val corrected: String, val separator: String)
    private var lastCorrection: Correction? = null

    /** A space we inserted after a picked suggestion; removed if punctuation follows. */
    private var autoSpaceInserted = false

    // AI panel state
    private enum class SourceMode { SELECTION, WHOLE_FIELD, AROUND_CURSOR }
    private var aiSource: String = ""
    private var aiSourceMode = SourceMode.WHOLE_FIELD
    private var aiFieldStart = 0
    private var aiBeforeLen = 0
    private var aiAfterLen = 0
    private var aiCurrentTone: Tone? = null
    private var aiCurrentResult: String? = null
    private val aiCache = HashMap<Tone, String>()
    private var aiRequestId = 0
    private var rewriter: AiRewriter? = null
    private var rewriterKey: String? = null

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        worker.execute {
            assets.open("en_words.txt").use { corrector.load(it) }
            prefs.learnedWords.forEach { corrector.learn(it) }
            dictionaryReady = true
        }
    }

    override fun onDestroy() {
        worker.shutdownNow()
        aiWorker.shutdownNow()
        rewriter?.close()
        super.onDestroy()
    }

    override fun onCreateInputView(): View {
        val keyboard = KeyboardUi(this, this)
        ui = keyboard
        return keyboard.root
    }

    override fun onStartInputView(info: EditorInfo, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        val cls = info.inputType and InputType.TYPE_MASK_CLASS
        val variation = info.inputType and InputType.TYPE_MASK_VARIATION
        val noSuggestions = info.inputType and InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS != 0
        val sensitive = variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
            variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
            variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
            variation == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS ||
            variation == InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS ||
            variation == InputType.TYPE_TEXT_VARIATION_URI ||
            variation == InputType.TYPE_TEXT_VARIATION_FILTER
        correctionAllowed = cls == InputType.TYPE_CLASS_TEXT && !sensitive && !noSuggestions
        autoCapAllowed = cls == InputType.TYPE_CLASS_TEXT && !sensitive

        lastCorrection = null
        autoSpaceInserted = false
        shift = ShiftState.OFF
        ui?.apply {
            showKeys()
            resetToLetters()
            setEnterLabel(enterLabelFor(info))
        }
        updateAutoCaps()
        updateSuggestions()
    }

    override fun onFinishInputView(finishingInput: Boolean) {
        super.onFinishInputView(finishingInput)
        aiRequestId++ // drop any in-flight AI response
        ui?.showKeys()
    }

    override fun onUpdateSelection(
        oldSelStart: Int, oldSelEnd: Int, newSelStart: Int, newSelEnd: Int,
        candidatesStart: Int, candidatesEnd: Int,
    ) {
        super.onUpdateSelection(oldSelStart, oldSelEnd, newSelStart, newSelEnd, candidatesStart, candidatesEnd)
        if (ui?.isAiPanelVisible == true) return
        updateSuggestions()
        updateAutoCaps()
    }

    // ------------------------------------------------------------------ typing

    override fun onCharacter(text: String) {
        val ic = currentInputConnection ?: return
        lastCorrection = null
        autoSpaceInserted = false
        ic.commitText(text, 1)
        if (shift == ShiftState.ON) setShift(ShiftState.OFF)
        updateSuggestions()
    }

    override fun onSeparator(text: String) {
        val ic = currentInputConnection ?: return
        val isSpace = text == " "
        ic.beginBatchEdit()
        try {
            // "word ," -> "word, " when the space was inserted by a suggestion pick.
            if (!isSpace && autoSpaceInserted && ic.getTextBeforeCursor(1, 0) == " ") {
                ic.deleteSurroundingText(1, 0)
            }
            val before = ic.getTextBeforeCursor(2, 0)?.toString().orEmpty()
            // Double-tap space -> ". "
            if (isSpace && before.length == 2 &&
                before[1] == ' ' && before[0].isLetterOrDigit()
            ) {
                ic.deleteSurroundingText(1, 0)
                ic.commitText(". ", 1)
                lastCorrection = null
            } else {
                val word = currentWord()
                val fix = if (shouldAutocorrect()) corrector.autocorrect(word) else null
                if (fix != null && fix != word) {
                    ic.deleteSurroundingText(word.length, 0)
                    ic.commitText(fix + text, 1)
                    lastCorrection = Correction(word, fix, text)
                } else {
                    ic.commitText(if (!isSpace && autoSpaceInserted) "$text " else text, 1)
                    lastCorrection = null
                }
            }
        } finally {
            ic.endBatchEdit()
        }
        autoSpaceInserted = false
        if (ui != null && text == " ") ui?.resetToLetters()
        updateAutoCaps()
        updateSuggestions()
    }

    override fun onDelete() {
        val ic = currentInputConnection ?: return
        autoSpaceInserted = false
        val correction = lastCorrection
        lastCorrection = null
        if (correction != null) {
            val tail = correction.corrected + correction.separator
            val before = ic.getTextBeforeCursor(tail.length, 0)?.toString()
            if (before == tail) {
                // Undo the auto-correction and remember the word so we don't "fix" it again.
                ic.beginBatchEdit()
                ic.deleteSurroundingText(tail.length, 0)
                ic.commitText(correction.original, 1)
                ic.endBatchEdit()
                learnWord(correction.original)
                updateSuggestions()
                return
            }
        }
        val selected = ic.getSelectedText(0)
        if (!selected.isNullOrEmpty()) {
            ic.commitText("", 1)
        } else {
            val before = ic.getTextBeforeCursor(2, 0)
            // Delete a whole surrogate pair (emoji) at once.
            val count = if (before != null && before.length == 2 && Character.isSurrogatePair(before[0], before[1])) 2 else 1
            if (before.isNullOrEmpty()) {
                sendDownUpKeyEvents(KeyEvent.KEYCODE_DEL)
            } else {
                ic.deleteSurroundingText(count, 0)
            }
        }
        updateAutoCaps()
        updateSuggestions()
    }

    override fun onEnter() {
        val ic = currentInputConnection ?: return
        val info = currentInputEditorInfo
        // Correct the last word before sending / moving on.
        val word = currentWord()
        val fix = if (shouldAutocorrect()) corrector.autocorrect(word) else null
        if (fix != null && fix != word) {
            ic.beginBatchEdit()
            ic.deleteSurroundingText(word.length, 0)
            ic.commitText(fix, 1)
            ic.endBatchEdit()
        }
        lastCorrection = null
        autoSpaceInserted = false

        val action = info.imeOptions and EditorInfo.IME_MASK_ACTION
        val multiLine = info.inputType and InputType.TYPE_TEXT_FLAG_MULTI_LINE != 0
        val noEnterAction = info.imeOptions and EditorInfo.IME_FLAG_NO_ENTER_ACTION != 0
        if (!multiLine && !noEnterAction && action != EditorInfo.IME_ACTION_NONE &&
            action != EditorInfo.IME_ACTION_UNSPECIFIED
        ) {
            ic.performEditorAction(action)
        } else {
            ic.commitText("\n", 1)
        }
        updateAutoCaps()
        updateSuggestions()
    }

    override fun onShift() {
        val now = System.currentTimeMillis()
        val next = when {
            shift == ShiftState.LOCKED -> ShiftState.OFF
            shift == ShiftState.ON && now - lastShiftTap < 400 -> ShiftState.LOCKED
            shift == ShiftState.ON -> ShiftState.OFF
            else -> ShiftState.ON
        }
        lastShiftTap = now
        setShift(next)
    }

    override fun onSwitchKeyboard() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (!switchToNextInputMethod(false)) onShowImePicker()
        } else {
            onShowImePicker()
        }
    }

    override fun onShowImePicker() {
        (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showInputMethodPicker()
    }

    override fun onSuggestionPicked(suggestion: Suggestion) {
        val ic = currentInputConnection ?: return
        val word = currentWord()
        ic.beginBatchEdit()
        if (word.isNotEmpty()) ic.deleteSurroundingText(word.length, 0)
        ic.commitText(suggestion.text + " ", 1)
        ic.endBatchEdit()
        if (!corrector.isKnown(suggestion.text)) learnWord(suggestion.text)
        lastCorrection = null
        autoSpaceInserted = true
        updateAutoCaps()
        updateSuggestions()
    }

    override fun hapticsEnabled(): Boolean = prefs.vibrate

    private fun setShift(state: ShiftState) {
        shift = state
        ui?.setShift(state)
    }

    private fun updateAutoCaps() {
        if (shift == ShiftState.LOCKED) return
        val ic = currentInputConnection
        val info = currentInputEditorInfo
        val caps = prefs.autoCapitalize && autoCapAllowed && ic != null && info != null &&
            ic.getCursorCapsMode(info.inputType) != 0
        setShift(if (caps) ShiftState.ON else ShiftState.OFF)
    }

    private fun shouldAutocorrect() = correctionAllowed && prefs.autocorrect && dictionaryReady

    /** Letters/apostrophes immediately before the cursor. */
    private fun currentWord(): String {
        val before = currentInputConnection?.getTextBeforeCursor(48, 0)?.toString() ?: return ""
        var i = before.length
        while (i > 0 && (before[i - 1].isLetter() || before[i - 1] == '\'')) i--
        return before.substring(i).trimStart('\'')
    }

    private fun updateSuggestions() {
        val keyboard = ui ?: return
        if (!correctionAllowed || !dictionaryReady) {
            keyboard.setSuggestions(emptyList())
            return
        }
        val word = currentWord()
        if (word.isEmpty()) {
            keyboard.setSuggestions(emptyList())
            return
        }
        val list = ArrayList<Suggestion>()
        val fix = if (prefs.autocorrect) corrector.autocorrect(word) else null
        if (fix != null) {
            // Keep-what-I-typed option, then the auto-correction that space will apply.
            list += Suggestion(word, "\"$word\"")
            list += Suggestion(fix, fix, highlighted = true)
            corrector.suggestions(word, 3).firstOrNull { it != fix && it != word }?.let { list += Suggestion(it) }
        } else {
            corrector.suggestions(word, 3).forEach { list += Suggestion(it) }
        }
        keyboard.setSuggestions(list)
    }

    private fun learnWord(word: String) {
        if (word.isBlank() || word.length < 2) return
        corrector.learn(word)
        prefs.learnedWords = prefs.learnedWords + word.lowercase()
    }

    private fun enterLabelFor(info: EditorInfo): String {
        if (info.inputType and InputType.TYPE_TEXT_FLAG_MULTI_LINE != 0) return "⏎"
        return when (info.imeOptions and EditorInfo.IME_MASK_ACTION) {
            EditorInfo.IME_ACTION_GO -> "Go"
            EditorInfo.IME_ACTION_SEARCH -> "🔍"
            EditorInfo.IME_ACTION_SEND -> "Send"
            EditorInfo.IME_ACTION_NEXT -> "Next"
            EditorInfo.IME_ACTION_DONE -> "Done"
            else -> "⏎"
        }
    }

    // ------------------------------------------------------------------ AI panel

    override fun onOpenAiPanel() {
        val keyboard = ui ?: return
        val ic = currentInputConnection ?: return
        aiCache.clear()
        aiCurrentResult = null
        aiCurrentTone = null

        val selected = ic.getSelectedText(0)?.toString()
        val extracted = ic.getExtractedText(ExtractedTextRequest().apply { hintMaxChars = 20_000 }, 0)
        when {
            !selected.isNullOrBlank() -> {
                aiSource = selected
                aiSourceMode = SourceMode.SELECTION
            }
            extracted?.text != null -> {
                aiSource = extracted.text.toString()
                aiSourceMode = SourceMode.WHOLE_FIELD
                aiFieldStart = extracted.startOffset
            }
            else -> {
                val before = ic.getTextBeforeCursor(5000, 0)?.toString().orEmpty()
                val after = ic.getTextAfterCursor(5000, 0)?.toString().orEmpty()
                aiSource = before + after
                aiSourceMode = SourceMode.AROUND_CURSOR
                aiBeforeLen = before.length
                aiAfterLen = after.length
            }
        }

        keyboard.showAiPanel()
        keyboard.setSelectedTone(null)
        when {
            aiSource.isBlank() ->
                keyboard.showAiMessage("Type your message first, then tap ✨ AI to fix grammar or change the tone.")
            isPasswordField() ->
                keyboard.showAiMessage("AI rewriting is disabled in password fields.")
            prefs.apiKey.isBlank() ->
                keyboard.showAiMessage("Add your Claude API key in settings to use AI rewriting.", offerSettings = true)
            else -> onToneSelected(Tone.GRAMMAR) // start with the corrected-grammar version
        }
    }

    private fun isPasswordField(): Boolean {
        val v = currentInputEditorInfo.inputType and InputType.TYPE_MASK_VARIATION
        return v == InputType.TYPE_TEXT_VARIATION_PASSWORD || v == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
            v == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
    }

    override fun onToneSelected(tone: Tone) {
        val keyboard = ui ?: return
        if (aiSource.isBlank() || isPasswordField()) return
        val key = prefs.apiKey
        if (key.isBlank()) {
            keyboard.showAiMessage("Add your Claude API key in settings to use AI rewriting.", offerSettings = true)
            return
        }
        aiCurrentTone = tone
        aiCache[tone]?.let {
            keyboard.setSelectedTone(tone)
            aiCurrentResult = it
            keyboard.showAiResult(it)
            return
        }
        aiCurrentResult = null
        keyboard.showAiLoading(tone)
        val requestId = ++aiRequestId
        val source = aiSource
        val client = rewriterFor(key)
        aiWorker.execute {
            val result = client.rewrite(source, tone)
            main.post {
                if (requestId != aiRequestId || source != aiSource) return@post
                when (result) {
                    is RewriteResult.Success -> {
                        aiCache[tone] = result.text
                        aiCurrentResult = result.text
                        keyboard.showAiResult(result.text)
                    }
                    is RewriteResult.Failure -> keyboard.showAiMessage(result.message)
                }
            }
        }
    }

    private fun rewriterFor(key: String): AiRewriter {
        val existing = rewriter
        if (existing != null && rewriterKey == key) return existing
        existing?.close()
        return AiRewriter(key).also {
            rewriter = it
            rewriterKey = key
        }
    }

    override fun onApplyRewrite() {
        val result = aiCurrentResult ?: return
        val ic = currentInputConnection ?: return
        ic.beginBatchEdit()
        when (aiSourceMode) {
            SourceMode.SELECTION -> ic.commitText(result, 1)
            SourceMode.WHOLE_FIELD -> {
                ic.setSelection(aiFieldStart, aiFieldStart + aiSource.length)
                ic.commitText(result, 1)
            }
            SourceMode.AROUND_CURSOR -> {
                ic.deleteSurroundingText(aiBeforeLen, aiAfterLen)
                ic.commitText(result, 1)
            }
        }
        ic.endBatchEdit()
        onCloseAiPanel()
    }

    override fun onCopyRewrite() {
        val result = aiCurrentResult ?: return
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("Rewritten text", result))
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            Toast.makeText(this, "Copied", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCloseAiPanel() {
        aiRequestId++
        ui?.showKeys()
        lastCorrection = null
        updateAutoCaps()
        updateSuggestions()
    }

    override fun onOpenSettings() {
        val intent = Intent(this, SettingsActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        startActivity(intent)
        requestHideSelf(0)
    }
}
