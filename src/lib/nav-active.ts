/**
 * Sidebar active-link matching.
 *
 * A detail page such as /reports/aged-debtors belongs to its own nav item and
 * also starts with the /reports prefix. Only the most specific href should be
 * highlighted, otherwise both the parent and child appear selected.
 */

export function navHrefMatches(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Return the longest matching nav href, or null when nothing matches. */
export function activeNavHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (!navHrefMatches(pathname, href)) continue;
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}
