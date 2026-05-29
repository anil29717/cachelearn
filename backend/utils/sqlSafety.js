/**
 * Safe SQL helpers for dynamic IN (...) lists — IDs only, parameterized.
 */

export function assertPositiveIntIds(ids) {
  if (!Array.isArray(ids)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of ids) {
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n <= 0) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** Returns { clause: '(?,?)', params: [1,2] } or empty when no ids. */
export function buildInClause(ids) {
  const safe = assertPositiveIntIds(ids);
  if (!safe.length) return { clause: '', params: [], safeIds: [] };
  return {
    clause: `(${safe.map(() => '?').join(',')})`,
    params: safe,
    safeIds: safe,
  };
}

/** Parameterized IN for bounded string literals (e.g. seed allowlist emails). */
export function buildStringInClause(values, maxLen = 255) {
  const safe = [];
  const seen = new Set();
  for (const raw of values) {
    const s = String(raw ?? '').trim().slice(0, maxLen);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    safe.push(s);
  }
  if (!safe.length) return { clause: '', params: [], safeValues: [] };
  return {
    clause: `(${safe.map(() => '?').join(',')})`,
    params: safe,
    safeValues: safe,
  };
}
