import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { initDb, query } from '../db.js';
import { authMiddleware, COOKIE_NAME } from '../middleware/auth.js';
import { logEvent } from '../logger.js';
import { authLimiter } from '../security.js';
import { loginSchema, parseOrThrow } from '../validation.js';

const router = express.Router();

const JWT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function signToken(payload) {
  const secret = process.env.JWT_SECRET;
  if (!secret || String(secret).trim() === '') {
    throw new Error('JWT secret not configured');
  }
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

function setAuthCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: JWT_MAX_AGE_MS,
    path: '/',
  });
}

function clearAuthCookie(res) {
  const secure = process.env.NODE_ENV === 'production';
  res.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true, secure, sameSite: 'lax' });
}

router.post('/register', async (req, res) => {
  try {
    await logEvent({
      level: 'warn',
      action: 'auth_register_disabled',
      message: 'Blocked public registration attempt',
      req,
    });
    return res.status(403).json({ error: 'Public registration is disabled. Ask an admin to create your account.' });
  } catch (err) {
    console.error('Register error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = parseOrThrow(loginSchema, req.body || {});

    await initDb();

    const rows = await query('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows.length) {
      await logEvent({ level: 'warn', action: 'auth_login_fail', message: 'Unknown email', req, meta: { email } });
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const userRow = rows[0];
    if (Number(userRow.is_active) === 0) {
      await logEvent({
        level: 'warn',
        action: 'auth_login_fail',
        message: 'Inactive account',
        userId: userRow.id,
        req,
        meta: { email },
      });
      return res.status(403).json({ error: 'Account is inactive. Contact admin.', code: 'ACCOUNT_INACTIVE' });
    }
    const match = await bcrypt.compare(password, userRow.password_hash);
    if (!match) {
      await logEvent({ level: 'warn', action: 'auth_login_fail', message: 'Bad password', req, meta: { email } });
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = { id: userRow.id, email: userRow.email, name: userRow.name, role: userRow.role };
    let token;
    try {
      token = signToken({ id: user.id, email: user.email, role: user.role });
    } catch (e) {
      console.error('JWT sign error', e);
      return res.status(500).json({ error: 'Server configuration error' });
    }
    setAuthCookie(res, token);
    await logEvent({ action: 'auth_login', message: `Login ${email}`, userId: user.id, req });
    return res.json({ user });
  } catch (err) {
    console.error('Login error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  return res.json({ success: true });
});

router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const rows = await query(
      'SELECT id, email, name, role, avatar_url, created_at, is_verified, is_active FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const p = rows[0];
    p.is_active = Number(p.is_active) === 1 ? 1 : 0;
    return res.json({ profile: p });
  } catch (err) {
    console.error('Profile error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
