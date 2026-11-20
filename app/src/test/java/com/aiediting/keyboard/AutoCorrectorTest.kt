package com.aiediting.keyboard

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.BeforeClass
import org.junit.Test
import java.io.File

class AutoCorrectorTest {

    companion object {
        private val corrector = AutoCorrector()

        @BeforeClass
        @JvmStatic
        fun load() {
            val file = listOf("src/main/assets/en_words.txt", "app/src/main/assets/en_words.txt")
                .map(::File).first { it.exists() }
            file.inputStream().use { corrector.load(it) }
        }
    }

    @Test fun leavesCorrectWordsAlone() {
        for (w in listOf("the", "hello", "keyboard", "Professional", "NASA", "quickly")) {
            assertNull(w, corrector.autocorrect(w))
        }
    }

    @Test fun fixesCommonTypos() {
        assertEquals("the", corrector.autocorrect("teh"))
        assertEquals("receive", corrector.autocorrect("recieve"))
        assertEquals("don't", corrector.autocorrect("dont"))
        assertEquals("I'm", corrector.autocorrect("im"))
        assertEquals("I", corrector.autocorrect("i"))
    }

    @Test fun fixesFatFingerAndDoubleLetterTypos() {
        assertEquals("hello", corrector.autocorrect("helo"))
        assertEquals("keyboard", corrector.autocorrect("keybaord"))
        assertEquals("meeting", corrector.autocorrect("meetimg"))
        assertEquals("tomorrow", corrector.autocorrect("tomorrw"))
        assertEquals("because", corrector.autocorrect("becasue"))
        assertEquals("address", corrector.autocorrect("adress"))
    }

    @Test fun keepsCapitalisation() {
        assertEquals("The", corrector.autocorrect("Teh"))
        assertEquals("HELLO", corrector.autocorrect("HELLLO"))
    }

    @Test fun learnedWordsAreNotCorrected() {
        val c = AutoCorrector()
        c.addWords(mapOf("hello" to 600))
        assertEquals("hello", c.autocorrect("helo"))
        assertEquals("what", corrector.autocorrect("waht"))
        c.learn("helo")
        assertNull(c.autocorrect("helo"))
    }

    @Test fun suggestsCompletions() {
        val s = corrector.suggestions("tha", 3)
        assertTrue(s.toString(), s.any { it == "that" || it == "thank" || it == "thanks" })
    }
}
