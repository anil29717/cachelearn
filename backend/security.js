import rateLimit from 'express-rate-limit';
import ipaddr from 'ipaddr.js';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

/** Stricter cap for library uploads (large bodies). */
export const libraryUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads. Please try again later.' },
});

/** Download / stream (bandwidth-heavy). */
export const libraryReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many download requests. Please try again later.' },
});

/** Deletes and destructive library operations. */
export const libraryMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait and try again.' },
});

function trustedForwardedFor(req) {
  return process.env.TRUST_PROXY === '1';
}

/** Prefer socket address unless behind a trusted reverse proxy (TRUST_PROXY=1). */
export function isLocalInitRequest(req) {
  const candidate = trustedForwardedFor(req)
    ? String(req.headers['x-forwarded-for'] || '')
        .split(',')[0]
        .trim() || req.socket?.remoteAddress || req.ip
    : req.socket?.remoteAddress || req.ip;
  const normalized = String(candidate).trim().toLowerCase();
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '::ffff:127.0.0.1' ||
    normalized === 'localhost'
  );
}

export function getClientIp(req) {
  if (trustedForwardedFor(req)) {
    const forwarded = String(req.headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim();
    if (forwarded) return forwarded;
  }
  return req.socket?.remoteAddress || req.ip || '';
}

function normalizeIp(input) {
  try {
    const parsed = ipaddr.parse(String(input).trim());
    if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) {
      return parsed.toIPv4Address();
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseAllowedNetworks() {
  return String(process.env.ALLOWED_NETWORKS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function matchesNetwork(ip, candidate) {
  const normalizedIp = normalizeIp(ip);
  if (!normalizedIp) return false;
  if (!candidate.includes('/')) {
    const normalizedCandidate = normalizeIp(candidate);
    return Boolean(normalizedCandidate && normalizedIp.toNormalizedString() === normalizedCandidate.toNormalizedString());
  }
  try {
    const [range, prefix] = ipaddr.parseCIDR(candidate);
    const comparableIp =
      normalizedIp.kind() !== range.kind() && normalizedIp.kind() === 'ipv4'
        ? ipaddr.parse(`::ffff:${normalizedIp.toString()}`)
        : normalizedIp;
    return comparableIp.match([range, prefix]);
  } catch {
    return false;
  }
}

export function trustedNetworkMiddleware(req, res, next) {
  const allowedNetworks = parseAllowedNetworks();
  if (!allowedNetworks.length) return next();
  const ip = getClientIp(req);
  if (allowedNetworks.some((candidate) => matchesNetwork(ip, candidate))) {
    return next();
  }
  return res.status(403).json({ error: 'Access allowed only from office or VPN networks.' });
}

/**
 * CSRF mitigation for cookie-based sessions: in production, mutating requests must present
 * Origin or Referer aligned with FRONTEND_URL. (No csurf/session store — SPA + SameSite + this check.)
 */
export function requireBrowserOriginForMutations(req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const fe = String(process.env.FRONTEND_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (!fe) return next();
  const origin = req.headers.origin;
  if (origin) {
    const o = origin.replace(/\/$/, '');
    if (o !== fe) return res.status(403).json({ error: 'Forbidden' });
    return next();
  }
  const referer = req.headers.referer || '';
  if (referer) {
    try {
      const u = new URL(referer);
      const refOrigin = `${u.protocol}//${u.host}`.replace(/\/$/, '');
      if (refOrigin !== fe) return res.status(403).json({ error: 'Forbidden' });
    } catch {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  return next();
}
