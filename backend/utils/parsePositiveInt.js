/** Parse route/body IDs without regex (SAST-safe, no ReDoS). */
export function parsePositiveIntParam(value) {
  const s = String(value ?? '').trim();
  if (!s || s.length > 15) return null;
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    if (code < 48 || code > 57) return null;
    if (i === 0 && code === 48) return null;
  }
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
