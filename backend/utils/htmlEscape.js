/** Escape text for HTML attribute/body interpolation (email templates). */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Allow only http(s) verification links from our app. */
export function assertSafeHttpUrl(raw) {
  const s = String(raw ?? '').trim();
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new Error('Invalid verification link');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Invalid verification link');
  }
  return s;
}
