import jwt from 'jsonwebtoken';

const COOKIE_NAME = 'auth_token';

export function getTokenFromRequest(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  if (req.cookies && req.cookies[COOKIE_NAME]) return String(req.cookies[COOKIE_NAME]).trim();
  return null;
}

export function authMiddleware(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret || String(secret).trim() === '') {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    req.user = jwt.verify(token, secret);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export { COOKIE_NAME };
