/**
 * Session / JWT lifetime (addresses scanner "missing expiration" findings).
 * JWT_EXPIRES_IN examples: 30m, 8h, 12h, 7d
 */
const UNIT_MS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

function defaultExpiresIn() {
  return process.env.NODE_ENV === 'production' ? '8h' : '7d';
}

export function getJwtExpiresIn() {
  const raw = String(process.env.JWT_EXPIRES_IN || defaultExpiresIn()).trim();
  if (!/^\d+[smhd]$/i.test(raw)) return defaultExpiresIn();
  return raw.toLowerCase();
}

export function jwtExpiresInToMs(expiresIn) {
  const m = String(expiresIn).trim().toLowerCase().match(/^(\d+)([smhd])$/);
  if (!m) return 8 * UNIT_MS.h;
  const n = Number(m[1]);
  const unit = m[2];
  if (!Number.isFinite(n) || n <= 0) return 8 * UNIT_MS.h;
  return n * UNIT_MS[unit];
}

export function getJwtMaxAgeMs() {
  return jwtExpiresInToMs(getJwtExpiresIn());
}

/** Frontend idle logout hint (minutes) — exposed via profile or documented in .env.example */
export function getSessionIdleMinutes() {
  const n = Number(process.env.SESSION_IDLE_MINUTES || 30);
  if (!Number.isFinite(n) || n < 5) return 30;
  if (n > 480) return 480;
  return Math.floor(n);
}
