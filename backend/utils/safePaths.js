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

export function assertWithinBase(baseDir, candidatePath) {
  const base = path.resolve(baseDir);
  const candidate = path.resolve(candidatePath);
  const rel = path.relative(base, candidate);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new PathTraversalError('Invalid path');
  }
  return { base, candidate };
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
  const segments = raw.split(/[/\\]+/).filter(Boolean);
  if (segments.some((seg) => seg === '.' || seg === '..')) {
    throw new PathTraversalError('Invalid path');
  }
  const base = path.resolve(absoluteBaseDir);
  const resolved = path.join(base, ...segments);
  return assertWithinBase(base, resolved).candidate;
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

/** CWE-22: create library folder only after slug is validated and confined under `libraryStorageRootAbs`. */
export function ensureLibrarySubdirExists(libraryStorageRootAbs, slugSegment) {
  const dir = getSafeLibrarySubdirPath(libraryStorageRootAbs, slugSegment);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** CWE-22: remove library folder subtree only when path resolves under the library root. */
export async function removeLibrarySubdirIfExists(libraryStorageRootAbs, slugSegment) {
  const dir = getSafeLibrarySubdirPath(libraryStorageRootAbs, slugSegment);
  try {
    await fs.promises.access(dir, fs.constants.F_OK);
  } catch {
    return;
  }
  await fs.promises.rm(dir, { recursive: true, force: true });
}

/** CWE-22: unlink a stored file by DB `relative_path` (verified under base, including symlinks). */
export async function unlinkVerifiedFileUnderBase(absoluteBaseDir, userRelativeInput) {
  const abs = getVerifiedFilePathUnderBase(absoluteBaseDir, userRelativeInput);
  try {
    await fs.promises.access(abs, fs.constants.F_OK);
  } catch {
    return;
  }
  await fs.promises.unlink(abs);
}

/** CWE-22: stat/open streams only on paths verified under base. */
export async function statVerifiedFileUnderBase(absoluteBaseDir, userRelativeInput) {
  const abs = getVerifiedFilePathUnderBase(absoluteBaseDir, userRelativeInput);
  return fs.promises.stat(abs);
}

export function createVerifiedReadStream(absoluteBaseDir, userRelativeInput, options) {
  const abs = getVerifiedFilePathUnderBase(absoluteBaseDir, userRelativeInput);
  return fs.createReadStream(abs, options);
}

/**
 * After multer (or any code) produces an absolute path, ensure it stays under `storage/` root.
 */
export function assertAbsoluteUnderStorageRoot(absolutePathCandidate, storageRootAbs) {
  const p = stripNullBytes(String(absolutePathCandidate ?? ''));
  if (!p) throw new PathTraversalError('Invalid path');
  if (!path.isAbsolute(p)) {
    throw new PathTraversalError('Invalid path');
  }
  return assertWithinBase(storageRootAbs, p).candidate;
}

/** CWE-22: multer/upload rollback — only unlink paths already under the storage root. */
export async function unlinkAbsoluteUnderStorageRoot(absolutePathCandidate, storageRootAbs) {
  const abs = assertAbsoluteUnderStorageRoot(absolutePathCandidate, storageRootAbs);
  try {
    await fs.promises.access(abs, fs.constants.F_OK);
  } catch {
    return;
  }
  await fs.promises.unlink(abs);
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
  const candidate = path.isAbsolute(s) ? path.resolve(s) : path.resolve(root, s);
  try {
    return assertWithinBase(root, candidate).candidate;
  } catch {
    return null;
  }
}

/** Alias for scanner-friendly naming */
export const getSafePath = getSafePathUnderBase;
