/**
 * Check an uploaded image's real signature instead of trusting the browser's
 * multipart Content-Type. This stops an HTML/JS payload being stored as
 * `image/png` and then served inline from the application origin.
 */

export type ImageMime = "image/png" | "image/jpeg" | "image/webp";

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

export function detectImageMime(bytes: Uint8Array): ImageMime | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
}

/** The declared MIME type must match the file's magic bytes. */
export function imageMatchesDeclaredType(bytes: Uint8Array, declared: string): boolean {
  return detectImageMime(bytes) === declared;
}
