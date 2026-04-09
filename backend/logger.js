import { initDb, query } from './db.js';
import { getClientIp } from './security.js';

const SENSITIVE_KEY = /password|passwd|secret|token|authorization|credential|apikey|api_key|jwt/i;

function redactMeta(meta) {
  if (meta == null) return meta;
  if (typeof meta !== 'object') return meta;
  if (Array.isArray(meta)) {
    return meta.map((x) => (typeof x === 'object' && x !== null ? redactMeta(x) : x));
  }
  const out = { ...meta };
  for (const k of Object.keys(out)) {
    if (SENSITIVE_KEY.test(k)) out[k] = '[redacted]';
    else if (out[k] && typeof out[k] === 'object') out[k] = redactMeta(out[k]);
  }
  return out;
}

function redactMessage(msg) {
  return String(msg || '').replace(/password\s*[:=]\s*\S+/gi, 'password=[redacted]');
}

/**
 * Append-only system log (admin UI). Never log passwords or full tokens.
 */
export async function logEvent({ level = 'info', action, message = '', userId = null, req = null, meta = null }) {
  try {
    await initDb();
    const ip = req ? getClientIp(req) : '';
    const ua = String(req?.headers?.['user-agent'] || '').slice(0, 500);
    const safeMeta = redactMeta(meta);
    const metaStr = safeMeta != null ? JSON.stringify(safeMeta).slice(0, 4000) : null;
    await query(
      `INSERT INTO system_logs (level, action, message, user_id, ip, user_agent, meta) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        String(level).slice(0, 20),
        String(action).slice(0, 120),
        redactMessage(message).slice(0, 2000),
        userId,
        String(ip).slice(0, 64),
        ua,
        metaStr,
      ]
    );
  } catch (e) {
    console.error('logEvent failed', e?.message || e);
  }
}
