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

/**
 * Only treat X-Forwarded-For as authoritative when TRUST_PROXY=1 and the TCP peer
 * is loopback (matches Express trust proxy 'loopback' — avoids spoofing from direct clients).
 */
function isTrustedProxySocket(req) {
  const raw = req.socket?.remoteAddress;
  if (!raw) return false;
  try {
    let addr = ipaddr.parse(String(raw).trim());
    if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) {
      addr = addr.toIPv4Address();
    }
    return addr.range() === 'loopback';
  } catch {
    return false;
  }
}

function trustedForwardedFor(req) {
  return process.env.TRUST_PROXY === '1' && isTrustedProxySocket(req);
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

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Normalize configured site URL to a comparable origin (scheme + host [+ port]). */
function allowedFrontendOrigin() {
  const raw = String(process.env.FRONTEND_URL || '').trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Strict CSRF defense for cookie-based sessions (double-submit not required).
 * Production only: mutating /api requests must send BOTH `Origin` and `Referer`, each parseable
 * and matching `FRONTEND_URL` origin. Stops forged cross-site posts that omit or spoof one header.
 * Pair with SameSite cookies (`authRoutes`). Non-browser clients must not rely on cookie auth alone.
 */
export function requireBrowserOriginForMutations(req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next();
  if (!MUTATING_METHODS.has(req.method)) return next();

  const allowed = allowedFrontendOrigin();
  // Fail closed: mutating API calls must not proceed without a known allowed origin.
  if (!allowed) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const originHdr = req.headers.origin;
  const refererHdr = req.headers.referer;
  if (!originHdr?.trim() || !refererHdr?.trim()) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  let originOrigin;
  let refererOrigin;
  try {
    originOrigin = new URL(String(originHdr).trim()).origin;
  } catch {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    refererOrigin = new URL(String(refererHdr).trim()).origin;
  } catch {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (originOrigin !== allowed || refererOrigin !== allowed) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return next();
}

/** Alias for clearer imports in apps that name middleware by concern. */
export const csrfProtectionForMutations = requireBrowserOriginForMutations;
