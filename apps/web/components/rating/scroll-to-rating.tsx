"use client";

import { useEffect } from "react";

/**
 * Scrolls the Ratings section (`#rating`) into view when it mounts on a page opened at
 * `#rating`, the papers list's Rate link: the section streams in after the browser looked for
 * the hash, so the browser's own jump lands at the top. Renders nothing.
 */
export function ScrollToRating() {
  useEffect(() => {
    if (window.location.hash === "#rating") document.getElementById("rating")?.scrollIntoView();
  }, []);
  return null;
}
