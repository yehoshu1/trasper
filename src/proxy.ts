import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request Content-Security-Policy with a nonce.
 *
 * Next attaches the nonce to its own framework/page scripts when it sees
 * `'nonce-…'` in the request CSP header. The root layout passes the same nonce
 * to the one hand-written inline theme script and to next-themes. Inline style
 * attributes are still allowed because React/Radix set them at runtime; a
 * nonce-only style policy would break the UI.
 */
export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const isDev = process.env.NODE_ENV === "development";
  const publicUrl = process.env.BETTER_AUTH_URL ?? process.env.APP_URL ?? "";
  const secureDeployment = publicUrl.startsWith("https://");
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self' blob: data:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(secureDeployment ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", policy);
  if (request.nextUrl.pathname === "/login/reset") {
    // The reset token is in the query string; do not leak it via Referer.
    response.headers.set("referrer-policy", "no-referrer");
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
