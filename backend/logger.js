import { initDb, query } from './db.js';

/**
 * Append-only system log (admin UI). Never log passwords or full tokens.
 */
export async function logEvent({ level = 'info', action, message = '', userId = null, req = null, meta = null }) {
  try {
    await initDb();
    const ip = req?.ip || req?.headers?.['x-forwarded-for']?.split?.(',')?.[0]?.trim() || '';
    const ua = String(req?.headers?.['user-agent'] || '').slice(0, 500);
    const metaStr = meta != null ? JSON.stringify(meta).slice(0, 4000) : null;
    await query(
      `INSERT INTO system_logs (level, action, message, user_id, ip, user_agent, meta) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        String(level).slice(0, 20),
        String(action).slice(0, 120),
        String(message).slice(0, 2000),
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
