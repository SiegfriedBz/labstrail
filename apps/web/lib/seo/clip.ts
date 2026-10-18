/** How much of a description search results show. */
const DESCRIPTION_LENGTH = 155;

/**
 * `text` with its whitespace collapsed, cut at a word to at most `max` characters with "…" when
 * it is longer (a comma or full stop left at the cut is dropped); a single word longer than
 * `max` is cut inside it. For descriptions, headlines and share cards.
 */
export function clip(text: string, max = DESCRIPTION_LENGTH): string {
  const whole = text.replace(/\s+/g, " ").trim();
  if (whole.length <= max) return whole;
  const room = whole.slice(0, max - 1);
  const space = whole[max - 1] === " " ? room.length : room.lastIndexOf(" ");
  const cut = space > 0 ? room.slice(0, space) : room;
  return `${cut.replace(/[\s,.;:]+$/, "")}…`;
}
