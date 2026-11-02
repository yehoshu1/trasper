import { isSameOriginRequest } from "@/lib/http";

/** Evaluate the browser's Origin/Sec-Fetch-Site headers for a route handler. */
export function requestIsSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const secFetchSite = request.headers.get("sec-fetch-site");
  const configured = process.env.BETTER_AUTH_URL ?? process.env.APP_URL;
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedOrigin =
    forwardedHost && (forwardedProto === "http" || forwardedProto === "https")
      ? `${forwardedProto}://${forwardedHost}`
      : undefined;
  const candidates = [configured, forwardedOrigin, requestUrl.origin].filter(
    (value): value is string => Boolean(value),
  );
  return candidates.some((requestOrigin) =>
    isSameOriginRequest({ origin, requestOrigin, secFetchSite }),
  );
}
