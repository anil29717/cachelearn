import express from 'express';
import bcrypt from 'bcryptjs';
import { initDb, query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { logEvent } from '../logger.js';
import { parseOrThrow, updateProfileSchema, changePasswordSchema } from '../validation.js';

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

router.put('/password', authMiddleware, async (req, res) => {
  try {
    await initDb();
    const { current_password: currentPassword, new_password: newPassword } = parseOrThrow(
      changePasswordSchema,
      req.body || {}
    );
    const rows = await query('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!match) {
      await logEvent({
        level: 'warn',
        action: 'password_change_fail',
        message: 'Incorrect current password',
        userId: req.user.id,
        req,
      });
      return res.status(401).json({ error: 'Current password is incorrect', code: 'WRONG_PASSWORD' });
    }
    const password_hash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, req.user.id]);
    await logEvent({
      action: 'password_change',
      message: 'Password updated',
      userId: req.user.id,
      req,
    });
    return res.json({ success: true });
  } catch (err) {
    if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Change password error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
