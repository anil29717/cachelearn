import fs from 'fs';
import path from 'path';

/**
 * Centralized path safety (CWE-22): all user/DB-derived paths must resolve strictly under a known base.
 * Rejects null bytes, absolute segments, `..` escapes, and symlink-based escapes when verifying existing paths.
 */

export class PathTraversalError extends Error {
  constructor(message = 'Invalid path') {
    super(message);
    this.name = 'PathTraversalError';
    this.code = 'PATH_TRAVERSAL';
  }
}

function stripNullBytes(s) {
  if (typeof s !== 'string' || s.includes('\0')) {
    throw new PathTraversalError('Invalid path');
  }
  return s.trim();
}

/**
 * Resolve a relative path (e.g. from DB `relative_path`) under an absolute base directory.
 * Input must not be absolute; result is guaranteed under `absoluteBaseDir` (logical resolution).
 */
export function getSafePathUnderBase(absoluteBaseDir, userInput) {
  const raw = stripNullBytes(String(userInput ?? ''));
  if (!raw) throw new PathTraversalError('Invalid path');
  if (path.isAbsolute(raw)) {
    throw new PathTraversalError('Invalid path');
  }
  const base = path.resolve(absoluteBaseDir);
  const resolved = path.resolve(base, raw);
  const rel = path.relative(base, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new PathTraversalError('Invalid path');
  }
  return resolved;
}

/**
 * Single-folder slug under `storage/library` (no slashes, strict charset — matches DB slug rules).
 */
export function getSafeLibrarySubdirPath(libraryStorageRootAbs, slugSegment) {
  const seg = String(slugSegment ?? '');
  stripNullBytes(seg);
  if (!seg || seg.includes('..') || /[/\\]/.test(seg) || !/^[\w-]+$/.test(seg)) {
    throw new PathTraversalError('Invalid path');
  }
  return getSafePathUnderBase(libraryStorageRootAbs, seg);
}

/**
 * After multer (or any code) produces an absolute path, ensure it stays under `storage/` root.
 */
export function assertAbsoluteUnderStorageRoot(absolutePathCandidate, storageRootAbs) {
  const p = stripNullBytes(String(absolutePathCandidate ?? ''));
  if (!p) throw new PathTraversalError('Invalid path');
  const resolved = path.resolve(p);
  const base = path.resolve(storageRootAbs);
  const rel = path.relative(base, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new PathTraversalError('Invalid path');
  }
  return resolved;
}

/**
 * For existing files: logical check + realpath so symlinks cannot point outside the base.
 */
export function getVerifiedFilePathUnderBase(absoluteBaseDir, userRelativeInput) {
  const logical = getSafePathUnderBase(absoluteBaseDir, userRelativeInput);
  if (!fs.existsSync(logical)) {
    return logical;
  }
  const realFile = fs.realpathSync.native(logical);
  const realBase = fs.realpathSync.native(path.resolve(absoluteBaseDir));
  const sep = path.sep;
  if (realFile !== realBase && !realFile.startsWith(realBase + sep)) {
    throw new PathTraversalError('Invalid path');
  }
  return realFile;
}

/**
 * TLS cert/key paths from env: must resolve under cwd or HTTPS_ARTIFACT_ROOT (if set).
 * Prevents `HTTPS_CERT_PATH=../../.env` style escapes from cwd.
 */
export function resolveTlsArtifactPath(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const s = stripNullBytes(String(raw));
  const rawRoot = process.env.HTTPS_ARTIFACT_ROOT;
  const root = rawRoot ? path.resolve(String(rawRoot).trim()) : path.resolve(process.cwd());
  const candidate = path.isAbsolute(s) ? path.normalize(s) : path.resolve(root, s);
  const rel = path.relative(root, candidate);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }
  return candidate;
}

/** Alias for scanner-friendly naming */
export const getSafePath = getSafePathUnderBase;
