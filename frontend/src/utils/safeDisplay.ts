/** Client-side display sanitization (matches backend safeDisplay.js). */
export function sanitizeDisplayName(input: string | null | undefined, maxLen = 255): string {
  let s = String(input ?? '');
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  s = s.replace(/<[^>]*>/g, '');
  s = s.replace(/[<>&]/g, '');
  return s.trim().slice(0, maxLen);
}
