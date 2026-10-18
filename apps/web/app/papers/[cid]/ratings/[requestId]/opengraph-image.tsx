/**
 * A rating's link shares the site's card, not its paper's: the paper's card shows the paper's
 * latest score, which need not be this rating's. A segment's own image wins over its parent's,
 * so this file stops the paper's card from reaching its ratings.
 */
export { alt, contentType, default, size } from "../../../../opengraph-image.tsx";
