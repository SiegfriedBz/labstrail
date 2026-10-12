import { DOMParser, type Element } from "@xmldom/xmldom";

/** A paper's header metadata, as read from GROBID's TEI. */
export interface PaperMetadata {
  readonly title: string;
  /** Each author's full name, in document order. */
  readonly authors: readonly string[];
  readonly abstract?: string;
  /** Lowercase, with no `https://doi.org/` or `doi:` prefix; absent when what GROBID read is not a DOI. */
  readonly doi?: string;
}

/** The result of {@link parseTeiHeader}. */
export type TeiResult =
  | { readonly ok: true; readonly metadata: PaperMetadata }
  | { readonly ok: false; readonly reason: "not-tei" | "no-title" };

const TEI_NS = "http://www.tei-c.org/ns/1.0";
const DOI_PREFIX = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:)/i;
/** A DOI (`10.<registrant>/<suffix>`) with no character that would break the IRI it goes into. */
const DOI = /^10\.\d{4,9}\/[^\s<>"{}|\\^`]+$/;

/**
 * Spacing accents a PDF's text layer can give apart from their letter in a name
 * ("Rodrı ´guez"), and the combining mark each stands for.
 */
const SPACING_ACCENTS: Readonly<Record<string, string>> = {
  "\u00b4": "\u0301",
  "\u02ca": "\u0301",
  "\u02cb": "\u0300",
  "\u00a8": "\u0308",
  "\u02c6": "\u0302",
  "\u02dc": "\u0303",
  "\u00b8": "\u0327",
  "\u02c7": "\u030c",
  "\u02da": "\u030a",
  "\u00af": "\u0304",
  "\u02d8": "\u0306",
  "\u02d9": "\u0307",
  "\u02dd": "\u030b",
  "\u02db": "\u0328",
};
/** A spacing accent opening a name part, before a lowercase letter ("´ramo ´n"). */
const OPENING_ACCENT = new RegExp(`^[${Object.keys(SPACING_ACCENTS).join("")}](?=\\p{Ll})`, "u");
/** The dotless i a LaTeX accent is drawn on, and the letter it stands for. */
const DOTLESS: Readonly<Record<string, string>> = { "\u0131": "i" };
/** The marks a dotless `ı` after them takes ("Garc ´ıa"); a breve stays with the letter before ("Yag ˘ız"). */
const ON_DOTLESS = new Set(["\u0301", "\u0300", "\u0308", "\u0302"]);
const LETTER = /^\p{L}$/u;
const UPPERCASE = /^\p{Lu}$/u;
/** One letter of Latin-1 Supplement to Latin Extended-B, the range of European names. */
const ACCENTED_LETTER = /^[\u00c0-\u024f]$/u;

/** True for a lowercase DOI that can be written into an IRI as is. */
export function isDoi(value: string): boolean {
  return DOI.test(value);
}

/**
 * Reads a paper's title, authors, abstract and DOI from GROBID's TEI header
 * (`processHeaderDocument`). Whitespace inside each field collapses to single spaces. In
 * authors' names, in Unicode NFC, an accent GROBID gives apart from its letter ("Rodrı ´guez",
 * "Bele ´n") is joined back to it ("Rodríguez", "Belén"); the title and the abstract stay as
 * GROBID gives them, since papers also write `´` as an apostrophe or a prime ("Alzheimer´s",
 * "3´ UTR").
 *
 * Returns `not-tei` for input that is not a TEI document with a header, and `no-title` for
 * a header with no title. Returns a result for every input.
 */
export function parseTeiHeader(xml: string): TeiResult {
  const header = teiHeader(xml);
  if (!header) return { ok: false, reason: "not-tei" };

  const titleStmt = first(header, "titleStmt");
  const title = text(titleStmt && first(titleStmt, "title"));
  if (!title) return { ok: false, reason: "no-title" };

  const analytic = first(header, "analytic");
  const authors = (analytic ? all(analytic, "author") : [])
    .map((author) => {
      const name = first(author, "persName");
      return name ? nameOf(all(name, "forename").concat(all(name, "surname"))) : "";
    })
    .filter((name) => name !== "");

  const abstractElement = first(header, "abstract");
  const abstract = abstractElement ? collapse(all(abstractElement, "p").map(text).join(" ")) : "";

  const doiElement = all(header, "idno").find(
    (idno) => idno.getAttribute("type")?.toUpperCase() === "DOI",
  );
  const read = text(doiElement).replace(DOI_PREFIX, "").toLowerCase();
  const doi = isDoi(read) ? read : "";

  return {
    ok: true,
    metadata: {
      title,
      authors,
      ...(abstract ? { abstract } : {}),
      ...(doi ? { doi } : {}),
    },
  };
}

function teiHeader(xml: string): Element | undefined {
  try {
    // Stop on any error, silently: core prints nothing, and a broken answer is not-tei.
    const parser = new DOMParser({
      onError: (level) => {
        if (level !== "warning") throw new Error("not-tei");
      },
    });
    const document = parser.parseFromString(xml, "text/xml");
    return first(document.documentElement, "teiHeader");
  } catch {
    return undefined;
  }
}

function all(parent: Element, localName: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS(TEI_NS, localName));
}

function first(parent: Element | null | undefined, localName: string): Element | undefined {
  return parent ? all(parent, localName)[0] : undefined;
}

function text(element: Element | undefined): string {
  return collapse(element?.textContent ?? "");
}

/**
 * A person's name from its parts, in order, with its split accents joined back. GROBID gives
 * an accent after its letter, so one opening a part before a lowercase letter ("Jose",
 * "´ramo ´n Banegas") goes to the last letter of the part before, when that part is more than
 * an initial and its letter takes the accent; after an initial, the accent joins inside the
 * name ("A", "´lvarez" → "Álvarez").
 */
function nameOf(parts: readonly Element[]): string {
  const texts = parts.map((part) => collapse(part.textContent ?? "").normalize("NFC"));
  for (let index = 1; index < texts.length; index++) {
    const opening = OPENING_ACCENT.exec(texts[index] as string)?.[0];
    const previous = [...(texts[index - 1] as string)];
    if (opening === undefined || previous.length < 2) continue;
    const joined = accented(previous.at(-1), SPACING_ACCENTS[opening] as string);
    if (joined === undefined) continue;
    texts[index - 1] = [...previous.slice(0, -1), joined].join("");
    texts[index] = (texts[index] as string).slice(opening.length);
  }
  return joinAccents(collapse(texts.join(" ")));
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Joins each spacing accent in a name to its letter, in the shapes GROBID gives: an acute,
 * grave, diaeresis or circumflex before a dotless `ı` goes to the `ı` ("Garc ´ıa"); any other
 * goes to the letter before it when a space or a dotless `ı` stands between them ("Bele ´n",
 * "Rodrı´guez"), and the space goes. It joins only when the two make one letter of Latin-1
 * Supplement to Latin Extended-B. Anything else stays as it is: an accent before a capital or
 * right after another letter is an apostrophe ("O´Brien", "N´diaye"), and an accent never
 * moves to a letter after it otherwise.
 */
function joinAccents(name: string): string {
  const chars = [...name];
  const out: string[] = [];
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index] as string;
    const mark = SPACING_ACCENTS[char];
    const next = chars[index + 1];
    if (mark === undefined || (next !== undefined && UPPERCASE.test(next))) {
      out.push(char);
      continue;
    }
    const spaceBefore = out.at(-1) === " ";
    const before = letterAt(out, out.length - (spaceBefore ? 2 : 1));
    const onDotless = next !== undefined && next in DOTLESS && ON_DOTLESS.has(mark);
    const onBefore = spaceBefore || (before !== undefined && before in DOTLESS);
    const joined = onDotless ? accented(next, mark) : onBefore ? accented(before, mark) : undefined;
    if (joined === undefined) {
      out.push(char);
      continue;
    }
    if (spaceBefore && before !== undefined) out.pop();
    if (onDotless) chars[index + 1] = joined;
    else out[out.length - 1] = joined;
  }
  return out.join("");
}

/** The letter at `index` in `chars`, or undefined for anything else or past either end. */
function letterAt(chars: readonly string[], index: number): string | undefined {
  const char = chars[index];
  return char !== undefined && LETTER.test(char) ? char : undefined;
}

/** `letter` with the combining `mark`, when there is a letter and the two compose into one Latin letter. */
function accented(letter: string | undefined, mark: string): string | undefined {
  if (letter === undefined) return undefined;
  const composed = `${DOTLESS[letter] ?? letter}${mark}`.normalize("NFC");
  return ACCENTED_LETTER.test(composed) ? composed : undefined;
}
