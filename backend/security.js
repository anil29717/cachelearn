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

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait and try again.' },
});

export function isLocalInitRequest(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const candidate = forwarded || req.ip || req.socket?.remoteAddress || '';
  const normalized = String(candidate).trim().toLowerCase();
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '::ffff:127.0.0.1' ||
    normalized === 'localhost'
  );
}

export function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || '';
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
