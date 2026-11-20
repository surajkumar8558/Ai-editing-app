# AI Editing Keyboard (Android)

An Android keyboard that fixes your typing as you go and, with one tap, rewrites the whole message in the tone you want. You don't have to copy text into ChatGPT or Gemini and paste it back.

## Features

**While typing (offline, on the device)**
- **Auto-correct** when you press space or punctuation: `teh` → `the`, `helo` → `hello`, `keybaord` → `keyboard`, `dont` → `don't`, `i` → `I`.
  - Uses a dictionary of about 50k English words with word frequencies, plus a typo model that knows which keys sit next to each other (QWERTY neighbours, swapped letters, doubled letters).
  - **Undo:** press backspace right after a correction to get back what you typed. The keyboard then learns that word.
  - Turned off automatically in password, email, URL and "no suggestions" fields.
- **Suggestion strip**: your word exactly as typed, the correction that space will apply (in bold), and word completions.
- Auto-capitalization at the start of a sentence, double-space for `. `, shift / caps lock, a numbers and symbols layer, hold ⌫ to keep deleting, and an enter key that matches the app's action (Send, Search, Go…).

**✨ AI button: grammar and tone rewrite (uses the Claude API)**
- Tap **✨ AI** on the keyboard. It immediately shows a **grammar-corrected version** of your message.
- Tap a tone to rewrite the message: **Professional · Casual · Polite · Authoritative**.
- **Replace text** puts the result into the text box. **Copy** copies it to the clipboard.
- Works on the selected text if you've selected some. Otherwise it uses everything in the text box.
- Each tone's result is kept while the panel is open, so switching between tones is instant.

## Project layout

```
app/src/main/java/com/aiediting/keyboard/
  AiKeyboardService.kt   InputMethodService: typing, auto-correct, undo, suggestions, AI panel logic
  KeyboardUi.kt          Keyboard views built in code (keys, suggestion bar, AI panel); light/dark aware
  AutoCorrector.kt       Offline spell checker (weighted Damerau-Levenshtein + frequencies); no Android deps
  AiRewriter.kt          Claude API call (official Anthropic Java SDK) + the tone prompts
  SettingsActivity.kt    Launcher screen: enable/select keyboard, API key, options, test box
  Prefs.kt               SharedPreferences wrapper
app/src/main/assets/en_words.txt   Word list with frequencies
app/src/test/.../AutoCorrectorTest.kt
```

## Build and install

You need Android Studio (or the Android SDK with platform 35) and JDK 17 or newer.

```bash
./gradlew assembleDebug                 # builds app/build/outputs/apk/debug/app-debug.apk
./gradlew installDebug                  # installs on a connected device or emulator
./gradlew testDebugUnitTest             # auto-correct unit tests
```

You can also open the folder in Android Studio and press **Run**.

## Setting it up on the phone

1. Open the **AI Editing Keyboard** app.
2. Tap **Enable in system settings** and turn the keyboard on.
3. Tap **Choose keyboard** and pick **AI Editing Keyboard**.
4. Paste a Claude API key (get one at [console.anthropic.com](https://console.anthropic.com)) and tap **Save**.
5. Type something in the test box, for example *"i dont thinks teh report are ready"*, then tap **✨ AI**.

## AI details

- Model: `claude-opus-5-5`, called through the official SDK `com.anthropic:anthropic-java`. Effort is set to `low` so rewrites come back quickly. To trade some quality for speed and cost, change `AiRewriter.MODEL` (for example to `claude-haiku-5-5`).
- If a request is ever declined by a safety filter, server-side refusal fallback (`fallbacks: "default"`) lets the API retry it on a fallback model instead of returning nothing.
- The system prompt treats your message as text to rewrite, never as instructions. If you type a question, it rewrites the question instead of answering it.
- **Privacy:** auto-correct runs entirely on the device. Text is sent to the Claude API only when you tap ✨ AI or pick a tone. The API key is stored in the app's private storage on the device. For a production app, consider sending requests through your own backend instead of putting user API keys on the device.

## Credits

The word frequencies in `en_words.txt` come from [wordfreq](https://github.com/rspeer/wordfreq) by Robyn Speer. The data is licensed CC-BY-SA 4.0.
