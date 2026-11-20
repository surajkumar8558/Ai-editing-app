package com.aiediting.keyboard

import android.content.Context
import android.content.SharedPreferences

/** Small wrapper around the app's private SharedPreferences. */
class Prefs(context: Context) {
    private val sp: SharedPreferences =
        context.applicationContext.getSharedPreferences("ai_keyboard", Context.MODE_PRIVATE)

    var apiKey: String
        get() = sp.getString(KEY_API, "").orEmpty()
        set(value) = sp.edit().putString(KEY_API, value.trim()).apply()

    var autocorrect: Boolean
        get() = sp.getBoolean(KEY_AUTOCORRECT, true)
        set(value) = sp.edit().putBoolean(KEY_AUTOCORRECT, value).apply()

    var autoCapitalize: Boolean
        get() = sp.getBoolean(KEY_AUTOCAP, true)
        set(value) = sp.edit().putBoolean(KEY_AUTOCAP, value).apply()

    var vibrate: Boolean
        get() = sp.getBoolean(KEY_VIBRATE, true)
        set(value) = sp.edit().putBoolean(KEY_VIBRATE, value).apply()

    var learnedWords: Set<String>
        get() = sp.getStringSet(KEY_LEARNED, emptySet()).orEmpty()
        set(value) = sp.edit().putStringSet(KEY_LEARNED, HashSet(value)).apply()

    companion object {
        private const val KEY_API = "api_key"
        private const val KEY_AUTOCORRECT = "autocorrect"
        private const val KEY_AUTOCAP = "auto_capitalize"
        private const val KEY_VIBRATE = "vibrate"
        private const val KEY_LEARNED = "learned_words"
    }
}
