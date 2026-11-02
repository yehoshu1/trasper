/**
 * Only avatars written by our own upload route are rendered. Better Auth's
 * update-user endpoint accepts an arbitrary image URL; without this filter an
 * authenticated user could put a tracking pixel or a data: URL in the shell
 * and in the admin user list.
 */
export function safeAvatarUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^\/uploads\/avatars\/([A-Za-z0-9._-]+)$/.exec(value);
  return match && match[1] !== "." && match[1] !== ".." ? value : null;
}
