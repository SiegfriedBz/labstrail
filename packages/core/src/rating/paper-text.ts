/** A paper's text, as the phase-1 scorer reads it (ADR 0018). */
export interface PaperText {
  /** The PDF's pages joined and cleaned, then fitted to the cap. */
  readonly text: string;
  /** True when the reference list was left out or the end cut, to fit the cap. */
  readonly shortened: boolean;
}

/** The result of {@link preparePaperText}: `no-text` when the PDF holds almost no letters. */
export type PreparePaperResult =
  | { readonly ok: true; readonly paper: PaperText }
  | { readonly ok: false; readonly reason: "no-text" };

/** Fewer letters than this across the pages means a PDF of pictures, such as a scan. */
const MIN_LETTERS = 500;
/** A quote shorter than this, letters and digits only, shows nothing on its own. */
const MIN_QUOTE_CHARS = 10;
/**
 * A quote may join up to this many passages of the paper, in order, each at least
 * `MIN_PASSAGE_CHARS` letters and digits long (the last at least `MIN_LAST_PASSAGE_CHARS`): a
 * statement that a page header, reference numbers or the box beside a first page interrupt.
 */
const MAX_PASSAGES = 3;
const MIN_PASSAGE_CHARS = 20;
const MIN_LAST_PASSAGE_CHARS = 8;
/**
 * The most letters and digits between two passages of a quote, about a page: the box beside a
 * PLOS paper's first page is printed between the lines of its abstract (2,000 apart in one).
 */
const MAX_GAP = 6_000;
/** The most places tried for one passage, when the paper holds it more than once. */
const MAX_PLACES = 50;
/**
 * An ellipsis in a quote (`…`, `...`, `. . .`, bracketed or not) marks text it leaves out: up to
 * `MAX_ELLIPSES` of them, each standing for punctuation only or at least `MIN_ELIDED_CHARS`
 * letters and digits, so an ellipsis never hides a word or two, such as "not".
 */
const ELLIPSIS = /[[(]?\s*(?:…|\.(?:\s?\.){2,})\s*[\])]?/gu;
const MAX_ELLIPSES = 2;
const MIN_ELIDED_CHARS = 20;
/** Letters Unicode does not decompose, as a PDF or a model may write them another way. */
const FOLDED: Readonly<Record<string, string>> = {
  ı: "i",
  ł: "l",
  ø: "o",
  đ: "d",
  ß: "ss",
  æ: "ae",
  œ: "oe",
};
/** What quotes are not matched on: anything but letters and digits, and spacing accents. */
const NOT_MATCHED = /[^\p{L}\p{N}]|\p{Lm}/gu;
const REFERENCES_LEFT_OUT = "[References left out]";
const CUT = "\n[…]";
const NUMBER_ONLY = /^\d{1,5}$/;
/**
 * Lines in a row ending in numbers that count up by one, from which a text is a line-numbered
 * manuscript: Word and LaTeX's lineno glue each line's number to its end ("Methods66").
 */
const MIN_NUMBERED_LINES = 8;
/** A line's last digits, when the character before them is neither a digit nor a space. */
const GLUED_DIGITS = /[^\d\s](\d+)$/;
const REFERENCES_HEADING =
  /^(?:references|reference list|bibliography|literature cited|works cited)$/i;
/** Headings that can follow a reference list: online methods, statements, appendices. */
const AFTER_REFERENCES =
  /^(?:(?:online |materials and )?methods|data (?:and code )?availability|code availability|acknowledge?ments?|author contributions|competing interests|conflicts? of interest|declarations?|funding|ethics|supplementary|supporting information|appendix)\b/i;

/**
 * A paper's text from its PDF's pages, as text extraction gives them: each line trimmed, lines
 * holding only a number (line and page numbers) dropped, the number a line-numbered manuscript
 * glues to each line's end dropped too, a lowercase word hyphenated across a line break joined,
 * runs of spaces and of blank lines collapsed. A text over `maxChars` loses
 * its reference list first (from a "References" heading to the next statement or methods
 * heading, or to the end), then is cut at a word boundary and marked `[…]`; it never passes
 * `maxChars`. The same pages always give the same text.
 *
 * Returns `no-text` for pages holding fewer than 500 letters, such as a scanned PDF's.
 */
export function preparePaperText(pages: readonly string[], maxChars: number): PreparePaperResult {
  const lines = pages.map((page) =>
    page.split("\n").map((line) => line.replace(/[ \t ]+/g, " ").trim()),
  );
  const text = withoutLineNumbers(lines)
    .map((page) => page.filter((line) => !NUMBER_ONLY.test(line)).join("\n"))
    .join("\n\n")
    .replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if ((text.match(/\p{L}/gu)?.length ?? 0) < MIN_LETTERS) return { ok: false, reason: "no-text" };
  if (text.length <= maxChars) return { ok: true, paper: { text, shortened: false } };

  const withoutReferences = leaveOutReferences(text);
  if (withoutReferences.length <= maxChars) {
    return { ok: true, paper: { text: withoutReferences, shortened: true } };
  }
  const room = withoutReferences.slice(0, maxChars - CUT.length + 1);
  const end = room.search(/\s\S*$/);
  const kept = room.slice(0, end > 0 ? end : maxChars - CUT.length).trimEnd();
  return { ok: true, paper: { text: `${kept}${CUT}`, shortened: true } };
}

/**
 * The pages' lines without the numbers a line-numbered manuscript glues to their ends, when
 * `MIN_NUMBERED_LINES` lines in a row count up by one. The count is followed across pages, past
 * lines without a number, such as a preprint server's footer, and through blank numbered lines,
 * which give their number alone ("176"). A line's own digits before its number stay: "NUTS
 * 202199" is line 99 of "NUTS 2021".
 */
function withoutLineNumbers(pages: readonly (readonly string[])[]): string[][] {
  if (!pages.some((lines) => countsUp(lines))) return pages.map((lines) => [...lines]);
  let expected: number | undefined;
  return pages.map((lines) => {
    const kept: string[] = [];
    for (const [index, line] of lines.entries()) {
      const next = lines[index + 1] ?? "";
      const number =
        expected !== undefined && numbered(line, expected)
          ? expected
          : gluedNumbers(line).find((value) => numbered(next, value + 1));
      if (number === undefined) {
        kept.push(line);
        continue;
      }
      kept.push(line === String(number) ? line : line.slice(0, -String(number).length).trimEnd());
      expected = number + 1;
    }
    return kept;
  });
}

/**
 * True when `MIN_NUMBERED_LINES` lines in a row count up by one from a line ending in a glued
 * number, blank numbered lines included.
 */
function countsUp(lines: readonly string[]): boolean {
  return lines.some((line, start) =>
    gluedNumbers(line).some((first) => {
      for (let count = 1; count < MIN_NUMBERED_LINES; count++) {
        const next = lines[start + count] ?? "";
        const value = first + count;
        if (next !== String(value) && !gluedNumbers(next).includes(value)) return false;
      }
      return true;
    }),
  );
}

/** True when `line` is the line numbered `value`: that number alone, or after the line's text. */
function numbered(line: string, value: number): boolean {
  const number = String(value);
  return line === number || (line.length > number.length && line.endsWith(number));
}

/**
 * The numbers glued to a line's end, longest first: its last 4 to 1 digits, after text with no
 * space. "Abstract32" may be line 32 or line 2: the longest that counts on is taken.
 */
function gluedNumbers(line: string): number[] {
  const digits = GLUED_DIGITS.exec(line)?.[1] ?? "";
  const longest = Math.min(4, digits.length);
  return Array.from({ length: longest }, (_, index) => Number(digits.slice(index - longest)));
}

/** The text with its last reference list replaced by a marker, or unchanged without one. */
function leaveOutReferences(text: string): string {
  const lines = text.split("\n");
  const start = lines.findLastIndex((line) => REFERENCES_HEADING.test(line));
  if (start < 0) return text;
  const after = lines.findIndex((line, index) => index > start && AFTER_REFERENCES.test(line));
  const end = after < 0 ? lines.length : after;
  return [...lines.slice(0, start), REFERENCES_LEFT_OUT, ...lines.slice(end)].join("\n");
}

/**
 * Text as a quote is matched against it: Unicode-decomposed (NFKD, so a ligature reads as its
 * letters) with accents dropped, lowercase, letters and digits only, and the letters Unicode
 * does not decompose folded (`ı` as `i`, `ß` as `ss`, `ø` as `o`, …). So line breaks,
 * hyphenation, dashes, quote marks and the accents a PDF writes apart from their letters
 * (`Garcı´a`, `Hoˆpital`) never decide a match. Each character is read on its own, so a
 * quote and a paper read the same way.
 */
export function normalizeForQuote(text: string): string {
  return [...text].map(matchedForm).join("");
}

/** A paper's text as {@link quoteFound} reads it, prepared once by {@link quoteTextOf}. */
export interface QuoteText {
  /** The text itself. */
  readonly text: string;
  /** Its letters and digits, as {@link normalizeForQuote} gives them. */
  readonly normalized: string;
  /** For each character of `normalized`, the index in `text` of the character it comes from. */
  readonly origins: readonly number[];
}

/** A paper's text prepared for {@link quoteFound}. */
export function quoteTextOf(text: string): QuoteText {
  let normalized = "";
  const origins: number[] = [];
  let index = 0;
  for (const char of text) {
    const form = matchedForm(char);
    normalized += form;
    for (let unit = 0; unit < form.length; unit++) origins.push(index);
    index += char.length;
  }
  return { text, normalized, origins };
}

/**
 * True when `quote` holds at least 10 letters or digits and is made of the paper's passages in
 * order, as {@link normalizeForQuote} reads both: up to three, each at least 20 letters and
 * digits long (the last at least 8), each the longest that fits. Between two passages, the paper
 * may hold numbers and punctuation (reference or line numbers) or whole lines (a page header,
 * the box beside a first page), up to about a page, but never words inside a line. So a
 * statement such text interrupts is found; a quote that leaves out a word, such as "not", or
 * part of one, or that the scorer made up, is not.
 *
 * An ellipsis in the quote marks text it leaves out: up to two of them split it into parts, each
 * found this way in order, at most about a page after the one before, and each ellipsis must
 * stand for punctuation only or at least 20 letters and digits. A part before an ellipsis is at
 * least 20 letters and digits long.
 */
export function quoteFound(paper: QuoteText, quote: string): boolean {
  const parts = quote
    .split(ELLIPSIS)
    .map(normalizeForQuote)
    .filter((part) => part.length > 0);
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  if (length < MIN_QUOTE_CHARS || parts.length > MAX_ELLIPSES + 1) return false;
  return partsFrom(paper, parts, 0, undefined);
}

/** Where a passage may be found: after the previous passage of its part, or past an ellipsis. */
interface After {
  /** Where the previous passage ended in the paper's normalized text. */
  readonly at: number;
  /** True when an ellipsis stands between them. */
  readonly elided: boolean;
}

/** True when the quote's parts from `index` are found in order, the first of them after `after`. */
function partsFrom(
  paper: QuoteText,
  parts: readonly string[],
  index: number,
  after: After | undefined,
): boolean {
  const part = parts[index];
  if (part === undefined) return true;
  const final = index === parts.length - 1;
  return passagesFrom(paper, part, 0, after, 1, final, (end) =>
    partsFrom(paper, parts, index + 1, { at: end, elided: true }),
  );
}

/** One character as quotes are matched: see {@link normalizeForQuote}. */
function matchedForm(char: string): string {
  return [...char.normalize("NFKD").toLowerCase()]
    .map((part) => FOLDED[part] ?? part)
    .join("")
    .replace(NOT_MATCHED, "");
}

/**
 * True when `needle`, from `start`, is made of the paper's passages in order, `passage` being
 * the number of the first of them: the longest one that fits, then the rest after it, and `rest`
 * holds from where the needle's last passage ends. `final` is false for a quote's part before an
 * ellipsis, whose last passage is as long as any other.
 */
function passagesFrom(
  paper: QuoteText,
  needle: string,
  start: number,
  after: After | undefined,
  passage: number,
  final: boolean,
  rest: (end: number) => boolean,
): boolean {
  const length = longestPassage(paper, needle, start, after);
  const last = start + length === needle.length;
  if (length < (last && final ? MIN_LAST_PASSAGE_CHARS : MIN_PASSAGE_CHARS)) return false;
  if (!last && passage === MAX_PASSAGES) return false;
  return placesOf(paper, needle.slice(start, start + length), after, MAX_PLACES).some((at) =>
    last
      ? rest(at + length)
      : passagesFrom(
          paper,
          needle,
          start + length,
          { at: at + length, elided: false },
          passage + 1,
          final,
          rest,
        ),
  );
}

/** The length of the longest prefix of `needle` from `start` the paper holds after `after`. */
function longestPassage(
  paper: QuoteText,
  needle: string,
  start: number,
  after: After | undefined,
): number {
  let found = 0;
  let missing = needle.length - start + 1;
  // A shorter prefix sits wherever a longer one does, so search the length.
  while (missing - found > 1) {
    const length = Math.floor((found + missing) / 2);
    const prefix = needle.slice(start, start + length);
    if (placesOf(paper, prefix, after, 1).length > 0) found = length;
    else missing = length;
  }
  return found;
}

/**
 * Up to `limit` places where the paper's normalized text holds `piece`: anywhere for a quote's
 * first passage, else from `after` to `MAX_GAP` later, with only {@link skippable} text before,
 * or past an ellipsis also at least `MIN_ELIDED_CHARS` letters and digits.
 */
function placesOf(
  paper: QuoteText,
  piece: string,
  after: After | undefined,
  limit: number,
): number[] {
  const places: number[] = [];
  const end = after === undefined ? paper.normalized.length : after.at + MAX_GAP;
  let at = paper.normalized.indexOf(piece, after?.at ?? 0);
  while (at >= 0 && at <= end && places.length < limit) {
    if (
      after === undefined ||
      skippable(paper, after.at, at) ||
      (after.elided && at - after.at >= MIN_ELIDED_CHARS)
    )
      places.push(at);
    at = paper.normalized.indexOf(piece, at + 1);
  }
  return places;
}

/**
 * True when the paper's text between two passages, from `after` to `at` in its normalized text,
 * may be left out of a quote: nothing, numbers and punctuation, or letters on whole lines of
 * their own, never letters inside a line the quote runs through.
 */
function skippable(paper: QuoteText, after: number, at: number): boolean {
  if (at === after) return true;
  const from = (paper.origins[after - 1] ?? -1) + 1;
  const skipped = paper.text.slice(from, paper.origins[at]);
  const first = skipped.search(/\p{L}/u);
  if (first < 0) return true;
  const last = skipped.search(/\p{L}[^\p{L}]*$/u);
  return skipped.lastIndexOf("\n", first) >= 0 && skipped.indexOf("\n", last) >= 0;
}
