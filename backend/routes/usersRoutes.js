import express from 'express';
import { initDb, query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { parseOrThrow, updateProfileSchema } from '../validation.js';

const router = express.Router();

// Update current user's profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    await initDb();
    const { name, avatar_url } = parseOrThrow(updateProfileSchema, req.body || {});
    const fields = [];
    const params = [];
    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (avatar_url !== undefined) { fields.push('avatar_url = ?'); params.push(avatar_url || null); }
    params.push(req.user.id);
    await query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
    const rows = await query('SELECT id, email, name, role, avatar_url, created_at FROM users WHERE id = ?', [req.user.id]);
    return res.json({ profile: rows[0] });
  } catch (err) {
    if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Update profile error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
