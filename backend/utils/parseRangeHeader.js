function digitsOnly(part) {
  if (part === '') return true;
  if (part.length > 15) return false;
  for (let i = 0; i < part.length; i += 1) {
    const c = part.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

/** Parse `bytes=start-end` without regex (SAST ReDoS-safe). */
export function parseBytesRangeHeader(rangeHeader) {
  const raw = String(rangeHeader ?? '').trim();
  if (!raw.toLowerCase().startsWith('bytes=')) return null;
  const spec = raw.slice(6);
  const dash = spec.indexOf('-');
  if (dash < 0) return null;
  const startPart = spec.slice(0, dash);
  const endPart = spec.slice(dash + 1);
  if (!digitsOnly(startPart) || !digitsOnly(endPart)) return null;
  return {
    start: startPart === '' ? 0 : Number(startPart),
    end: endPart === '' ? null : Number(endPart),
  };
}
