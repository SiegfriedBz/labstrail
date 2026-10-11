import { NavLink } from "./nav-link.tsx";

/** The header's page links, each shown as current on its own page. */
export function HeaderNav() {
  return (
    <>
      <NavLink href="/papers">Papers</NavLink>
      <NavLink href="/publish">Publish</NavLink>
    </>
  );
}
