// Right-to-left scripts: Hebrew, Arabic, Syriac, Thaana, NKo, Samaritan, Mandaic.
const rightToLeftScript = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/g

// Left-to-right scripts that carry letters: Latin, Greek, Cyrillic.
const leftToRightScript = /[a-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u02af\u0370-\u03ff\u0400-\u04ff\u1e00-\u1eff]/gi

/**
 * `dir="auto"` resolves from the first strong character, which flips a mostly
 * Arabic text that opens with an identifier such as "React". Counting both
 * scripts and keeping the majority holds the text in the language it is mostly
 * written in. Digits and punctuation are neutral and decide nothing.
 */
export function textDirection(text: string) {
  const rtl = text.length - text.replace(rightToLeftScript, "").length
  const ltr = text.length - text.replace(leftToRightScript, "").length

  if (rtl === ltr) return

  return rtl > ltr ? "rtl" : "ltr"
}
