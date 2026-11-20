package com.aiediting.keyboard

import java.io.InputStream
import kotlin.math.abs
import kotlin.math.min

/**
 * Offline spell checker / auto-corrector.
 *
 * - Dictionary: ~50k English words with frequencies (assets/en_words.txt).
 * - Candidates are found with a weighted Damerau–Levenshtein distance where substituting a
 *   neighbouring key on a QWERTY layout is cheaper than any other substitution (fat-finger typos).
 * - Candidates are ranked by edit distance first and word frequency second.
 * - A small table of common mistakes ("teh", "dont", "recieve", ...) always wins.
 *
 * This class has no Android dependencies so it can be unit-tested on the JVM.
 */
class AutoCorrector {

    private val frequencies = HashMap<String, Int>(64_000)
    private val byLength = HashMap<Int, MutableList<String>>()
    private val userWords = HashSet<String>()

    /** Words sorted by frequency (desc); used for prefix completions. */
    private var sortedByFrequency: List<String> = emptyList()

    val size: Int get() = frequencies.size

    fun load(input: InputStream) {
        input.bufferedReader().useLines { lines ->
            lines.forEach { line ->
                if (line.isEmpty() || line.startsWith("#")) return@forEach
                val tab = line.indexOf('\t')
                val word = if (tab > 0) line.substring(0, tab) else line
                val freq = if (tab > 0) line.substring(tab + 1).trim().toIntOrNull() ?: 100 else 100
                addWordInternal(word, freq)
            }
        }
        // Apostrophe-less contractions like "dont" appear in web text but should be corrected.
        COMMON_MISTAKES.keys.forEach { removeWordInternal(it) }
        rebuildSorted()
    }

    /** Add words directly (used by tests and for learned words). */
    fun addWords(words: Map<String, Int>) {
        words.forEach { (w, f) -> addWordInternal(w, f) }
        rebuildSorted()
    }

    fun learn(word: String) {
        val w = word.lowercase()
        if (w.isBlank()) return
        userWords += w
        if (w !in frequencies) {
            addWordInternal(w, USER_WORD_FREQ)
            rebuildSorted()
        }
    }

    fun learnedWords(): Set<String> = userWords.toSet()

    fun isKnown(word: String): Boolean {
        val w = word.lowercase()
        return w in frequencies || w in userWords
    }

    /**
     * Returns the word that should replace [typed] when the user finishes it (space/punctuation),
     * or null if it should be left alone.
     */
    fun autocorrect(typed: String): String? {
        if (typed.isEmpty() || typed.any { it.isDigit() }) return null
        val lower = typed.lowercase()

        // Standalone "i" and its contractions are always capitalised.
        if (lower == "i") return if (typed == "I") null else "I"

        COMMON_MISTAKES[lower]?.let { return matchCase(typed, it).takeIf { r -> r != typed } }

        if (isKnown(lower)) return null
        if (typed.length < 2) return null
        // Probably an acronym or a name the user typed on purpose.
        if (typed.length in 2..4 && typed.all { it.isUpperCase() }) return null

        val best = corrections(lower, 1).firstOrNull() ?: return null
        val maxDistance = if (lower.length <= 4) 1.0 else 2.0
        if (best.distance > maxDistance) return null
        return matchCase(typed, best.word)
    }

    /**
     * Suggestions for the suggestion strip while the user is typing [typed]:
     * the typed word itself (if valid), close corrections and prefix completions.
     */
    fun suggestions(typed: String, limit: Int = 3): List<String> {
        if (typed.isEmpty()) return emptyList()
        val lower = typed.lowercase()
        val result = LinkedHashSet<String>()

        COMMON_MISTAKES[lower]?.let { result += matchCase(typed, it) }
        if (lower == "i") result += "I"

        val known = isKnown(lower)
        val corrections = if (known) emptyList() else corrections(lower, limit).map { matchCase(typed, it.word) }
        val completions = completions(lower, limit + 1).filter { it != lower }.map { matchCase(typed, it) }

        if (known) {
            result += typed
            result += completions
        } else {
            result += corrections.take(2)
            result += completions
            result += corrections
        }
        return result.take(limit)
    }

    fun completions(prefix: String, limit: Int): List<String> {
        if (prefix.isEmpty()) return emptyList()
        val out = ArrayList<String>(limit)
        for (w in sortedByFrequency) {
            if (w.length > prefix.length && w.startsWith(prefix)) {
                out += w
                if (out.size >= limit) break
            }
        }
        return out
    }

    data class Candidate(val word: String, val distance: Double, val frequency: Int)

    fun corrections(lower: String, limit: Int): List<Candidate> {
        val maxDist = if (lower.length <= 4) 1.0 else 2.0
        val candidates = ArrayList<Candidate>()
        val len = lower.length
        for (l in (len - 2)..(len + 2)) {
            val bucket = byLength[l] ?: continue
            for (w in bucket) {
                if (abs(w.length - len) > maxDist) continue
                val d = distance(lower, w, maxDist)
                if (d <= maxDist) candidates += Candidate(w, d, frequencies[w] ?: 0)
            }
        }
        // Lower distance wins; frequency breaks near-ties (a 10x more common word is worth ~0.07 edits).
        candidates.sortWith(compareBy<Candidate> { it.distance - it.frequency / 1500.0 })
        return candidates.take(limit)
    }

    /**
     * Weighted Damerau–Levenshtein (optimal string alignment) distance with early exit once every
     * cell in a row exceeds [maxDist].
     */
    fun distance(a: String, b: String, maxDist: Double = Double.MAX_VALUE): Double {
        val n = a.length
        val m = b.length
        var prev2 = DoubleArray(m + 1)
        var prev = DoubleArray(m + 1) { it.toDouble() }
        var cur = DoubleArray(m + 1)
        for (i in 1..n) {
            cur[0] = i.toDouble()
            var rowMin = cur[0]
            for (j in 1..m) {
                val ca = a[i - 1]
                val cb = b[j - 1]
                val sub = if (ca == cb) 0.0 else substitutionCost(ca, cb)
                // Typing a letter twice (or once instead of twice) is a very common slip.
                val del = if (i > 1 && ca == a[i - 2]) DOUBLE_LETTER_COST else 1.0
                val ins = if (j > 1 && cb == b[j - 2]) DOUBLE_LETTER_COST else 1.0
                var v = min(min(prev[j] + del, cur[j - 1] + ins), prev[j - 1] + sub)
                if (i > 1 && j > 1 && ca == b[j - 2] && a[i - 2] == cb) {
                    v = min(v, prev2[j - 2] + TRANSPOSE_COST)
                }
                cur[j] = v
                if (v < rowMin) rowMin = v
            }
            if (rowMin > maxDist) return rowMin
            val t = prev2; prev2 = prev; prev = cur; cur = t
        }
        return prev[m]
    }

    private fun substitutionCost(a: Char, b: Char): Double {
        if (a == '\'' || b == '\'') return 0.5
        return if (NEIGHBOURS[a]?.contains(b) == true) ADJACENT_COST else 1.0
    }

    private fun addWordInternal(word: String, freq: Int) {
        val w = word.lowercase()
        val existing = frequencies[w]
        if (existing == null) {
            frequencies[w] = freq
            byLength.getOrPut(w.length) { ArrayList() } += w
        } else if (freq > existing) {
            frequencies[w] = freq
        }
    }

    private fun removeWordInternal(word: String) {
        if (frequencies.remove(word) != null) byLength[word.length]?.remove(word)
    }

    private fun rebuildSorted() {
        sortedByFrequency = frequencies.entries.sortedByDescending { it.value }.map { it.key }
    }

    companion object {
        private const val ADJACENT_COST = 0.7
        private const val TRANSPOSE_COST = 0.5
        private const val DOUBLE_LETTER_COST = 0.4
        private const val USER_WORD_FREQ = 450

        /** Applies the capitalisation pattern of [typed] to [replacement]. */
        fun matchCase(typed: String, replacement: String): String = when {
            replacement.startsWith("I'") || replacement == "I" -> replacement
            typed.length > 1 && typed.all { !it.isLetter() || it.isUpperCase() } -> replacement.uppercase()
            typed.firstOrNull()?.isUpperCase() == true -> replacement.replaceFirstChar { it.uppercase() }
            else -> replacement
        }

        private val ROWS = listOf("qwertyuiop", "asdfghjkl", "zxcvbnm")

        /** QWERTY neighbours (same row and the rows directly above/below). */
        private val NEIGHBOURS: Map<Char, Set<Char>> = buildMap {
            for ((r, row) in ROWS.withIndex()) {
                for ((c, ch) in row.withIndex()) {
                    val set = HashSet<Char>()
                    row.getOrNull(c - 1)?.let(set::add)
                    row.getOrNull(c + 1)?.let(set::add)
                    for (dr in listOf(-1, 1)) {
                        val other = ROWS.getOrNull(r + dr) ?: continue
                        // Rows are staggered: the keys at c-1..c+1 touch this key.
                        for (dc in -1..1) other.getOrNull(c + dc)?.let(set::add)
                    }
                    put(ch, set)
                }
            }
        }

        /** Frequent typos and missing apostrophes. Keys are lowercase. */
        val COMMON_MISTAKES: Map<String, String> = mapOf(
            "teh" to "the", "hte" to "the", "taht" to "that", "thier" to "their", "recieve" to "receive",
            "recieved" to "received", "beleive" to "believe", "definately" to "definitely",
            "seperate" to "separate", "occured" to "occurred", "untill" to "until", "wich" to "which",
            "becuase" to "because", "beacuse" to "because", "alot" to "a lot", "tommorow" to "tomorrow",
            "tomorow" to "tomorrow", "goverment" to "government", "enviroment" to "environment",
            "wierd" to "weird", "freind" to "friend", "acheive" to "achieve", "adress" to "address",
            "accomodate" to "accommodate", "begining" to "beginning", "calender" to "calendar",
            "concious" to "conscious", "existance" to "existence", "familar" to "familiar",
            "finaly" to "finally", "foriegn" to "foreign", "gaurd" to "guard", "happend" to "happened",
            "immediatly" to "immediately", "knowlege" to "knowledge", "neccessary" to "necessary",
            "necessery" to "necessary", "noticable" to "noticeable", "persue" to "pursue",
            "posession" to "possession", "prefered" to "preferred", "publically" to "publicly",
            "realy" to "really", "reccomend" to "recommend", "recomend" to "recommend",
            "succesful" to "successful", "suprise" to "surprise", "truely" to "truly", "wether" to "whether",
            "writting" to "writing", "youre" to "you're", "theyre" to "they're", "dont" to "don't",
            "doesnt" to "doesn't", "didnt" to "didn't", "cant" to "can't", "wont" to "won't",
            "isnt" to "isn't", "arent" to "aren't", "wasnt" to "wasn't", "werent" to "weren't",
            "havent" to "haven't", "hasnt" to "hasn't", "hadnt" to "hadn't", "couldnt" to "couldn't",
            "shouldnt" to "shouldn't", "wouldnt" to "wouldn't", "mustnt" to "mustn't", "im" to "I'm",
            "ive" to "I've", "thats" to "that's", "whats" to "what's", "wheres" to "where's",
            "theres" to "there's", "heres" to "here's", "youve" to "you've",
            "youll" to "you'll", "youd" to "you'd", "theyve" to "they've", "theyll" to "they'll",
            "weve" to "we've", "shes" to "she's", "hes" to "he's", "i'm" to "I'm", "i've" to "I've",
            "i'll" to "I'll", "i'd" to "I'd",
        )
    }
}
