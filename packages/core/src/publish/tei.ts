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
 * Spacing accents a PDF's text layer can give apart from their letter ("Rodrı ´guez"), and the
 * combining mark each stands for. ASCII `^`, `~` and the backtick are left out: in papers they
 * are maths, URLs and code.
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
/** One or more spacing accents opening a text. */
const LEADING_ACCENTS = new RegExp(`^[${Object.keys(SPACING_ACCENTS).join("")}]+`, "u");
/** The dotless letters a LaTeX accent is drawn on, and the letter they stand for. */
const DOTLESS: Readonly<Record<string, string>> = { "\u0131": "i", "\u0237": "j" };
const LETTER = /^\p{L}$/u;
/** One letter of Latin-1 Supplement to Latin Extended-B, the range of European names. */
const ACCENTED_LETTER = /^[\u00c0-\u024f]$/u;

/** True for a lowercase DOI that can be written into an IRI as is. */
export function isDoi(value: string): boolean {
  return DOI.test(value);
}

/**
 * Reads a paper's title, authors, abstract and DOI from GROBID's TEI header
 * (`processHeaderDocument`). Whitespace inside each field collapses to single spaces, and an
 * accent GROBID gives apart from its letter ("Rodrı ´guez", "Bele ´n") is joined back to it
 * ("Rodríguez", "Belén"), each field then in Unicode NFC.
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
 * A person's name from its parts, in order. GROBID gives an accent after its letter, so one
 * that opens a part ("Jose", "´Ramo ´n Banegas") belongs to the letter ending the part before.
 */
function nameOf(parts: readonly Element[]): string {
  const texts = parts.map((part) => part.textContent?.trim() ?? "");
  for (let index = 1; index < texts.length; index++) {
    const leading = LEADING_ACCENTS.exec(texts[index] as string)?.[0];
    if (leading === undefined) continue;
    texts[index - 1] += leading;
    texts[index] = (texts[index] as string).slice(leading.length);
  }
  return collapse(texts.join(" "));
}

function collapse(value: string): string {
  return joinAccents(value.replace(/\s+/g, " ").trim()).normalize("NFC");
}

/**
 * Joins each spacing accent to its letter, at most one space away: a dotless `ı` or `ȷ` on
 * either side first (the base a LaTeX accent is drawn on), else the letter before, else the
 * letter after; the first that composes into one Latin letter takes it, and an accent none
 * composes with stays. A joined accent's space to a letter before it goes (the text layer puts
 * one there), and so does its space to the letter after it when that letter takes it.
 */
function joinAccents(value: string): string {
  const chars = [...value];
  const out: string[] = [];
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index] as string;
    const mark = SPACING_ACCENTS[char];
    if (mark === undefined) {
      out.push(char);
      continue;
    }
    const spaceBefore = out.at(-1) === " ";
    const spaceAfter = chars[index + 1] === " ";
    const before = letterAt(out, out.length - (spaceBefore ? 2 : 1));
    const afterAt = index + (spaceAfter ? 2 : 1);
    const after = letterAt(chars, afterAt);
    const byBefore = accented(before, mark);
    const byAfter = accented(after, mark);
    const joinsAfter =
      byAfter !== undefined && (byBefore === undefined || (isDotless(after) && !isDotless(before)));
    const joined = joinsAfter ? byAfter : byBefore;
    if (joined === undefined) {
      out.push(char);
      continue;
    }
    if (spaceBefore && before !== undefined) out.pop();
    if (joinsAfter) {
      chars[afterAt] = joined;
      if (spaceAfter) index++;
    } else {
      out[out.length - 1] = joined;
    }
  }
  return out.join("");
}

/** The letter at `index` in `chars`, or undefined for anything else or past either end. */
function letterAt(chars: readonly string[], index: number): string | undefined {
  const char = chars[index];
  return char !== undefined && LETTER.test(char) ? char : undefined;
}

function isDotless(letter: string | undefined): boolean {
  return letter !== undefined && Object.hasOwn(DOTLESS, letter);
}

/** `letter` with the combining `mark`, when there is a letter and the two compose into one Latin letter. */
function accented(letter: string | undefined, mark: string): string | undefined {
  if (letter === undefined) return undefined;
  const composed = `${DOTLESS[letter] ?? letter}${mark}`.normalize("NFC");
  return ACCENTED_LETTER.test(composed) ? composed : undefined;
}
