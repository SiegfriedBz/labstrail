"use client";

import { useState } from "react";

/** Past this many characters, an abstract starts cut to five lines. */
const LONG_ABSTRACT = 420;

/**
 * A published paper's abstract, as read from its PDF. A long one starts cut to five lines,
 * with a toggle that shows all of it.
 */
export function Abstract({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > LONG_ABSTRACT;
  return (
    <section aria-labelledby="abstract-title" className="grid gap-2">
      <h2 id="abstract-title" className="text-sm font-semibold">
        Abstract
      </h2>
      <p
        id="abstract-text"
        className={`max-w-[68ch] leading-relaxed text-ink/80 ${long && !open ? "line-clamp-5" : ""}`}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls="abstract-text"
          onClick={() => setOpen((shown) => !shown)}
          className="link w-fit text-sm"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </section>
  );
}
