/**
 * Sanitize user-visible labels (folder names, file names, display names).
 * Strips HTML/tags and control characters — defense in depth for stored XSS.
 */

const HTML_TAG_RE = /<[^>]*>/g;
const CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

export function sanitizeDisplayName(input, maxLen = 255) {
  let s = String(input ?? '');
  s = s.replace(CONTROL_RE, '');
  s = s.replace(HTML_TAG_RE, '');
  s = s.replace(/[<>&]/g, '');
  return s.trim().slice(0, maxLen);
}

/** True if raw input is safe to store (no HTML/script patterns). */
export function isSafeDisplayName(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return false;
  if (/[<>&]/.test(raw)) return false;
  if (HTML_TAG_RE.test(raw)) return false;
  if (/javascript:/i.test(raw)) return false;
  if (/on\w+\s*=/i.test(raw)) return false;
  return sanitizeDisplayName(raw) === raw;
}
