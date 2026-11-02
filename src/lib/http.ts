/**
 * Same-origin checks for state-changing route handlers.
 *
 * Server Actions get an origin check from Next.js; ordinary POST route
 * handlers do not. Upload endpoints therefore check Origin and
 * Sec-Fetch-Site themselves. SameSite=Lax session cookies are the second
 * layer, not the only one.
 */

export interface SameOriginInput {
  origin?: string | null;
  requestOrigin?: string | null;
  secFetchSite?: string | null;
}

export function isSameOriginRequest(input: SameOriginInput): boolean {
  const fetchSite = input.secFetchSite?.toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;

  const origin = input.origin?.trim();
  // A sandboxed frame sends "null"; never accept it for a state change.
  if (origin === "null") return false;
  if (!origin) return true;
  const expected = input.requestOrigin?.trim();
  if (!expected) return false;
  try {
    // Compare hosts, not schemes: TLS usually terminates at the reverse proxy,
    // so the request URL the app sees may be http while the browser is https.
    return new URL(origin).host === new URL(expected).host;
  } catch {
    return false;
  }
}
