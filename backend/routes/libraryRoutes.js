import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { initDb, query, queryInList } from '../db.js';
import { assertPositiveIntIds } from '../utils/sqlSafety.js';
import crypto from 'crypto';
import { authMiddleware } from '../middleware/auth.js';
import { logEvent } from '../logger.js';
import { libraryStorageRoot, storageAbsRoot } from '../config/storagePaths.js';
import { parsePositiveIntParam } from '../utils/parsePositiveInt.js';
import { parseBytesRangeHeader } from '../utils/parseRangeHeader.js';
import {
  assertAbsoluteUnderStorageRoot,
  createVerifiedReadStream,
  ensureLibrarySubdirExists,
  getVerifiedFilePathUnderBase,
  removeLibrarySubdirIfExists,
  statVerifiedFileUnderBase,
  unlinkAbsoluteUnderStorageRoot,
  unlinkVerifiedFileUnderBase,
} from '../utils/safePaths.js';
import {
  libraryUploadLimiter,
  libraryReadLimiter,
  libraryMutationLimiter,
} from '../security.js';

const MulterError = multer.MulterError;
import {
  createFolderSchema,
  fileRenameSchema,
  folderAccessSchema,
  folderVisibilitySchema,
  parseOrThrow,
  videoProgressUpdateSchema,
} from '../validation.js';
import { isSafeDisplayName, sanitizeDisplayName } from '../utils/safeDisplay.js';

const router = express.Router();

const storageRoot = libraryStorageRoot;

const MAX_FOLDER_TREE_DEPTH = 64;
const MAX_FOLDER_ROWS = 10_000;
const MAX_FOLDER_ACCESS_WRITES = 1000;

function parseRangeForFile(rangeHeader, fileSize) {
  const parsed = parseBytesRangeHeader(rangeHeader);
  if (!parsed) return { error: 'Invalid range' };
  const start = parsed.start;
  const end = parsed.end == null ? fileSize - 1 : parsed.end;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < 0 ||
    start > end ||
    end >= fileSize
  ) {
    return { error: 'Invalid range' };
  }
  return { start, end };
}

function sanitizeDownloadName(name) {
  const base = path.basename(String(name || 'download'));
  const safe = base
    .replace(/[\r\n]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .trim();
  return safe || 'download';
}

/** DB `relative_path` → verified absolute path under `storage/` (blocks traversal + symlink escape). */
function resolvedStorageFilePath(relativePath) {
  return getVerifiedFilePathUnderBase(storageAbsRoot, relativePath);
}

function mapFolderForClient(row) {
  if (!row) return row;
  return { ...row, name: sanitizeDisplayName(row.name, 120) };
}

function mapFileForClient(row) {
  if (!row) return row;
  return {
    ...row,
    original_name: sanitizeDisplayName(row.original_name, 255),
    folder_name: row.folder_name != null ? sanitizeDisplayName(row.folder_name, 120) : row.folder_name,
  };
}

function mapFoldersForClient(rows) {
  return rows.map(mapFolderForClient);
}

const MAX_LIBRARY_UPLOAD_BYTES = 512 * 1024 * 1024;

function setLibrarySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Cache-Control', 'private, no-store');
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  return next();
}

async function canAccessFolder(user, folderId) {
  if (user?.role === 'admin') return true;
  // Walk up ancestors; if any folder is restricted, user must be explicitly granted access there.
  let curId = folderId;
  while (curId) {
    const rows = await query('SELECT id, parent_id, visibility FROM content_folders WHERE id = ?', [curId]);
    if (!rows.length) return false;
    const f = rows[0];
    if (String(f.visibility || 'all') === 'restricted') {
      const access = await query(
        'SELECT id FROM folder_access WHERE folder_id = ? AND user_id = ? LIMIT 1',
        [f.id, user.id]
      );
      if (!access.length) return false;
    }
    curId = f.parent_id || null;
  }
  return true;
}

function toSlug(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

function sanitizeBaseName(filename) {
  const ext = path.extname(filename || '');
  const base = path.basename(filename || 'file', ext);
  return `${base}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100) || 'file';
}

const allowedMimes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'video/mp4',
  'video/x-msvideo',
  'video/x-matroska',
  'video/quicktime',
  'video/webm',
]);

const allowedExtensionsByMime = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'video/mp4': ['.mp4'],
  'video/x-msvideo': ['.avi'],
  'video/x-matroska': ['.mkv'],
  'video/quicktime': ['.mov'],
  'video/webm': ['.webm'],
};

const upload = multer({
  limits: { fileSize: MAX_LIBRARY_UPLOAD_BYTES },
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dest = req.libraryUploadDest || storageRoot;
      cb(null, dest);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const safeBase = sanitizeBaseName(file.originalname);
      const slug = String(req.libraryFolderSlug || 'upload').replace(/[^a-z0-9_-]/gi, '').slice(0, 80) || 'upload';
      const nonce = crypto.randomBytes(8).toString('hex');
      cb(null, `${slug}__${Date.now()}__${nonce}__${safeBase}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExts = allowedExtensionsByMime[file.mimetype] || [];
    if (allowedMimes.has(file.mimetype) && allowedExts.includes(ext)) return cb(null, true);
    return cb(new Error('Unsupported file type. Allowed: PDF, DOC, DOCX, and video files.'));
  },
});

function handleLibraryUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large' });
      }
      return res.status(400).json({ error: 'Upload rejected. Check file size and multipart fields.' });
    }
    if (String(err?.message || '').includes('Unsupported file type')) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  });
}

async function prepareLibraryUpload(req, res, next) {
  try {
    await initDb();
    const folderId = parsePositiveIntParam(req.params.folderId);
    if (!folderId) return res.status(400).json({ error: 'Invalid folder id' });
    const folders = await query('SELECT id, slug FROM content_folders WHERE id = ?', [folderId]);
    if (!folders.length) return res.status(404).json({ error: 'Folder not found' });
    const folder = folders[0];
    const slug = String(folder.slug || '');
    let folderPath;
    try {
      folderPath = ensureLibrarySubdirExists(storageRoot, slug);
    } catch {
      return res.status(400).json({ error: 'Invalid folder storage path' });
    }
    req.libraryUploadDest = folderPath;
    req.libraryFolderSlug = slug;
    next();
  } catch (err) {
    console.error('prepareLibraryUpload', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getSubtreeFolderIds(rootId) {
  const ids = [rootId];
  let frontier = assertPositiveIntIds([rootId]);
  let depth = 0;
  while (frontier.length) {
    depth += 1;
    if (depth > MAX_FOLDER_TREE_DEPTH || ids.length > MAX_FOLDER_ROWS) {
      throw Object.assign(new Error('Folder tree too large'), { statusCode: 400 });
    }
    const kids = await queryInList('SELECT id FROM content_folders WHERE parent_id IN', frontier);
    frontier = assertPositiveIntIds(kids.map((k) => k.id));
    ids.push(...frontier);
  }
  return assertPositiveIntIds(ids);
}

async function getFileRow(fileId) {
  const rows = await query(
    `SELECT ff.id, ff.folder_id, ff.original_name, ff.stored_name, ff.mime_type, ff.file_size, ff.uploaded_by, ff.created_at,
            cf.name AS folder_name
     FROM folder_files ff
     JOIN content_folders cf ON cf.id = ff.folder_id
     WHERE ff.id = ?`,
    [fileId]
  );
  return rows[0] || null;
}

async function getProgressRow(userId, fileId) {
  const rows = await query(
    `SELECT user_id, file_id, watched_seconds, duration_seconds, max_percent, completed, completed_at,
            last_position_seconds, engaged_watch_seconds, updated_at
     FROM video_progress
     WHERE user_id = ? AND file_id = ?`,
    [userId, fileId]
  );
  return rows[0] || null;
}

router.post('/folders', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await initDb();
    const parsed = parseOrThrow(createFolderSchema, {
      name: req.body?.name,
      parent_id: req.body?.parent_id != null && req.body.parent_id !== '' ? req.body.parent_id : null,
    });
    const name = parsed.name;
    const parentId = parsed.parent_id ?? null;

    const baseSlug = toSlug(name);
    if (!baseSlug) return res.status(400).json({ error: 'Invalid folder name' });

    let prefix = '';
    if (parentId) {
      const parents = await query('SELECT id, slug FROM content_folders WHERE id = ?', [parentId]);
      if (!parents.length) return res.status(404).json({ error: 'Parent folder not found' });
      prefix = `${parents[0].slug}__`;
    }

    let slug = `${prefix}${baseSlug}`;
    let count = 1;
    while (true) {
      const existing = await query('SELECT id FROM content_folders WHERE slug = ?', [slug]);
      if (!existing.length) break;
      slug = `${prefix}${baseSlug}-${count++}`;
    }

    const result = await query(
      'INSERT INTO content_folders (name, slug, created_by, parent_id) VALUES (?, ?, ?, ?)',
      [name, slug, req.user.id, parentId || null]
    );

    try {
      ensureLibrarySubdirExists(storageRoot, slug);
    } catch {
      return res.status(500).json({ error: 'Server error' });
    }

    return res.status(201).json({
      folder: {
        id: result.insertId,
        name,
        slug,
        parent_id: parentId || null,
      },
    });
  } catch (err) {
    if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Create folder error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/folders', authMiddleware, async (req, res) => {
  try {
    await initDb();
    const all = await query(
      `SELECT f.id, f.name, f.slug, f.parent_id, f.visibility, f.created_by, f.created_at, COUNT(ff.id) AS file_count
       FROM content_folders f
       LEFT JOIN folder_files ff ON ff.folder_id = f.id
       GROUP BY f.id, f.name, f.slug, f.parent_id, f.visibility, f.created_by, f.created_at
       ORDER BY f.parent_id IS NULL DESC, f.name ASC`
    );

    if (all.length > MAX_FOLDER_ROWS) {
      return res.status(400).json({ error: 'Too many folders to list' });
    }

    if (req.user?.role === 'admin') {
      return res.json({ folders: all });
    }

    // Filter folders to those user can access; also include ancestors so tree renders.
    const allowedIds = new Set();
    const byId = new Map(all.map((f) => [f.id, f]));
    for (const f of all) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await canAccessFolder(req.user, f.id);
      if (!ok) continue;
      let cur = f;
      while (cur) {
        allowedIds.add(cur.id);
        cur = cur.parent_id ? byId.get(cur.parent_id) : null;
      }
    }
    const folders = all.filter((f) => allowedIds.has(f.id));
    return res.json({ folders: mapFoldersForClient(folders) });
  } catch (err) {
    console.error('List folders error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/folders/:folderId/files',
  authMiddleware,
  requireAdmin,
  libraryUploadLimiter,
  prepareLibraryUpload,
  handleLibraryUpload,
  async (req, res) => {
    const uploadedPath = req.file?.path;
    try {
      await initDb();
      const folderId = parsePositiveIntParam(req.params.folderId);
      if (!folderId) return res.status(400).json({ error: 'Invalid folder id' });

      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      const safeOriginalName = sanitizeDisplayName(file.originalname, 255);
      if (!safeOriginalName || !isSafeDisplayName(file.originalname)) {
        if (uploadedPath) {
          try {
            await unlinkAbsoluteUnderStorageRoot(uploadedPath, storageAbsRoot);
          } catch (_) {
            /* ignore */
          }
        }
        return res.status(400).json({ error: 'Invalid file name' });
      }

      const storedName = file.filename;
      let absolutePath;
      try {
        absolutePath = assertAbsoluteUnderStorageRoot(file.path, storageAbsRoot);
      } catch {
        return res.status(400).json({ error: 'Invalid upload path' });
      }
      const relativePath = path.relative(storageAbsRoot, absolutePath).replace(/\\/g, '/');
      const result = await query(
        `INSERT INTO folder_files
      (folder_id, original_name, stored_name, relative_path, mime_type, file_size, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [folderId, file.originalname, storedName, relativePath, file.mimetype, file.size, req.user.id]
      );

      await logEvent({
        action: 'library_upload',
        message: String(file.originalname || 'file').slice(0, 200),
        userId: req.user.id,
        req,
        meta: { folder_id: folderId, file_id: result.insertId },
      });

      return res.status(201).json({
        file: {
          id: result.insertId,
          folder_id: folderId,
          original_name: file.originalname,
          stored_name: storedName,
          mime_type: file.mimetype,
          file_size: file.size,
        },
      });
    } catch (err) {
      if (uploadedPath) {
        try {
          await unlinkAbsoluteUnderStorageRoot(uploadedPath, storageAbsRoot);
        } catch (_) {
          /* ignore */
        }
      }
      console.error('Upload file error', err);
      if (err instanceof MulterError) {
        return res.status(400).json({ error: 'Upload rejected. Check file size and file type.' });
      }
      if (err?.message === 'Unsupported file type. Allowed: PDF, DOC, DOCX, and video files.') {
        return res.status(400).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

router.get('/folders/:folderId/files', authMiddleware, async (req, res) => {
  try {
    await initDb();
    const folderId = parsePositiveIntParam(req.params.folderId);
    if (!folderId) return res.status(400).json({ error: 'Invalid folder id' });
    if (!(await canAccessFolder(req.user, folderId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const files = await query(
      `SELECT id, folder_id, original_name, stored_name, mime_type, file_size, uploaded_by, created_at
       FROM folder_files
       WHERE folder_id = ?
       ORDER BY created_at DESC`,
      [folderId]
    );
    return res.json({ files: files.map(mapFileForClient) });
  } catch (err) {
    console.error('List files error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/folders/:folderId/progress', authMiddleware, async (req, res) => {
  try {
    await initDb();
    const folderId = parsePositiveIntParam(req.params.folderId);
    if (!folderId) return res.status(400).json({ error: 'Invalid folder id' });
    if (!(await canAccessFolder(req.user, folderId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const rows = await query(
      `SELECT ff.id AS file_id,
              COALESCE(vp.watched_seconds, 0) AS watched_seconds,
              COALESCE(vp.duration_seconds, 0) AS duration_seconds,
              COALESCE(vp.max_percent, 0) AS max_percent,
              COALESCE(vp.completed, 0) AS completed,
              vp.completed_at,
              COALESCE(vp.last_position_seconds, 0) AS last_position_seconds,
              COALESCE(vp.engaged_watch_seconds, 0) AS engaged_watch_seconds,
              vp.updated_at
       FROM folder_files ff
       LEFT JOIN video_progress vp
         ON vp.file_id = ff.id AND vp.user_id = ?
       WHERE ff.folder_id = ? AND ff.mime_type LIKE 'video/%'`,
      [req.user.id, folderId]
    );
    return res.json({ progress: rows });
  } catch (err) {
    console.error('Folder progress error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/files/:fileId/progress', authMiddleware, async (req, res) => {
  try {
    await initDb();
    const fileId = parsePositiveIntParam(req.params.fileId);
    if (!fileId) return res.status(400).json({ error: 'Invalid file id' });
    const file = await getFileRow(fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    if (!String(file.mime_type || '').startsWith('video/')) {
      return res.status(400).json({ error: 'Progress is available only for video files' });
    }
    if (!(await canAccessFolder(req.user, file.folder_id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const progress = await getProgressRow(req.user.id, fileId);
    return res.json({
      progress: progress || {
        user_id: req.user.id,
        file_id: fileId,
        watched_seconds: 0,
        duration_seconds: 0,
        max_percent: 0,
        completed: 0,
        completed_at: null,
        last_position_seconds: 0,
        engaged_watch_seconds: 0,
        updated_at: null,
      },
    });
  } catch (err) {
    console.error('File progress error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/files/:fileId/progress', authMiddleware, async (req, res) => {
  try {
    await initDb();
    const fileId = parsePositiveIntParam(req.params.fileId);
    if (!fileId) return res.status(400).json({ error: 'Invalid file id' });
    const file = await getFileRow(fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    if (!String(file.mime_type || '').startsWith('video/')) {
      return res.status(400).json({ error: 'Progress is available only for video files' });
    }
    if (!(await canAccessFolder(req.user, file.folder_id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const parsed = parseOrThrow(videoProgressUpdateSchema, req.body || {});
    const duration = Math.max(0, Number(parsed.duration_seconds || 0));
    const watched = Math.max(0, Number(parsed.watched_seconds || 0));
    const lastPosition = Math.max(0, Number(parsed.last_position_seconds || 0));
    let engaged = Math.max(0, Number(parsed.engaged_watch_seconds || 0));

    const existing = await getProgressRow(req.user.id, fileId);
    const nextWatched = Math.max(Number(existing?.watched_seconds || 0), watched);
    const nextDuration = Math.max(Number(existing?.duration_seconds || 0), duration);
    const nextLastPosition = Math.max(Number(existing?.last_position_seconds || 0), lastPosition);
    const prevEngaged = Number(existing?.engaged_watch_seconds || 0);
    if (nextDuration > 0) {
      engaged = Math.min(nextDuration * 1.05, Math.max(prevEngaged, engaged));
    } else {
      engaged = Math.max(prevEngaged, engaged);
    }

    const positionPercent = nextDuration > 0 ? Math.min(100, (nextLastPosition / nextDuration) * 100) : 0;
    const engagedPercent = nextDuration > 0 ? Math.min(100, (engaged / nextDuration) * 100) : 0;
    /** Progress bar: cannot exceed both playhead and real watch time (prevents seek-to-end showing 100%). */
    const nextPercent = Math.min(
      100,
      Math.max(Number(existing?.max_percent || 0), Math.min(positionPercent, engagedPercent))
    );

    const ENGAGED_COMPLETION_RATIO = 0.92;
    const END_POSITION_RATIO = 0.98;
    const nearEnd =
      nextDuration > 0 &&
      (nextLastPosition >= nextDuration * END_POSITION_RATIO || nextWatched >= nextDuration * END_POSITION_RATIO);
    const engagedEnough = nextDuration > 0 && engaged >= nextDuration * ENGAGED_COMPLETION_RATIO;
    const newlyEligible = nearEnd && engagedEnough;
    const wasCompleted = Number(existing?.completed) === 1;
    const completed = wasCompleted || newlyEligible ? 1 : 0;

    await query(
      `INSERT INTO video_progress
        (user_id, file_id, watched_seconds, duration_seconds, max_percent, completed, completed_at, last_position_seconds, engaged_watch_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         watched_seconds = VALUES(watched_seconds),
         duration_seconds = VALUES(duration_seconds),
         max_percent = VALUES(max_percent),
         completed = VALUES(completed),
         completed_at = CASE
           WHEN completed = 0 AND VALUES(completed) = 1 THEN CURRENT_TIMESTAMP
           ELSE completed_at
         END,
         last_position_seconds = VALUES(last_position_seconds),
         engaged_watch_seconds = VALUES(engaged_watch_seconds),
         updated_at = CURRENT_TIMESTAMP`,
      [
        req.user.id,
        fileId,
        nextWatched,
        nextDuration,
        nextPercent,
        completed,
        completed ? new Date() : null,
        nextLastPosition,
        engaged,
      ]
    );

    const progress = await getProgressRow(req.user.id, fileId);
    if (completed && !existing?.completed) {
      await logEvent({
        action: 'video_completed',
        message: `Completed video ${file.original_name}`.slice(0, 200),
        userId: req.user.id,
        req,
        meta: { file_id: fileId, folder_id: file.folder_id },
      });
    }
    return res.json({ progress });
  } catch (err) {
    if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Update video progress error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/files/:fileId', authMiddleware, requireAdmin, libraryMutationLimiter, async (req, res) => {
  try {
    await initDb();
    const fileId = parsePositiveIntParam(req.params.fileId);
    const { original_name: originalName } = parseOrThrow(fileRenameSchema, req.body || {});
    if (!fileId) return res.status(400).json({ error: 'Invalid file id' });

    const rows = await query('SELECT id FROM folder_files WHERE id = ?', [fileId]);
    if (!rows.length) return res.status(404).json({ error: 'File not found' });

    await query('UPDATE folder_files SET original_name = ? WHERE id = ?', [originalName, fileId]);
    const updated = await query(
      `SELECT id, folder_id, original_name, stored_name, mime_type, file_size, uploaded_by, created_at
       FROM folder_files WHERE id = ?`,
      [fileId]
    );
    return res.json({ file: mapFileForClient(updated[0]) });
  } catch (err) {
    if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Update file error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/files/:fileId', authMiddleware, requireAdmin, libraryMutationLimiter, async (req, res) => {
  try {
    await initDb();
    const fileId = parsePositiveIntParam(req.params.fileId);
    if (!fileId) return res.status(400).json({ error: 'Invalid file id' });

    const rows = await query(
      'SELECT id, relative_path FROM folder_files WHERE id = ?',
      [fileId]
    );
    if (!rows.length) return res.status(404).json({ error: 'File not found' });

    const file = rows[0];
    await query('DELETE FROM folder_files WHERE id = ?', [fileId]);

    try {
      await unlinkVerifiedFileUnderBase(storageAbsRoot, file.relative_path);
    } catch {
      /* invalid stored path or missing file */
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('Delete file error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/files/:fileId/download', authMiddleware, libraryReadLimiter, async (req, res) => {
  try {
    await initDb();
    const fileId = parsePositiveIntParam(req.params.fileId);
    if (!fileId) return res.status(400).json({ error: 'Invalid file id' });

    const rows = await query(
      'SELECT id, folder_id, original_name, relative_path, mime_type FROM folder_files WHERE id = ?',
      [fileId]
    );
    if (!rows.length) return res.status(404).json({ error: 'File not found' });
    if (!(await canAccessFolder(req.user, rows[0].folder_id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const file = rows[0];
    let absolutePath;
    try {
      absolutePath = resolvedStorageFilePath(file.relative_path);
      await statVerifiedFileUnderBase(storageAbsRoot, file.relative_path);
    } catch {
      return res.status(404).json({ error: 'Stored file is missing' });
    }

    setLibrarySecurityHeaders(res);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    return res.download(absolutePath, sanitizeDownloadName(file.original_name), (err) => {
      if (err && !res.headersSent) {
        console.error('Download file error', err);
        res.status(500).json({ error: 'Server error' });
      }
    });
  } catch (err) {
    console.error('Download file error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/files/:fileId/stream', authMiddleware, libraryReadLimiter, async (req, res) => {
  try {
    await initDb();
    const fileId = parsePositiveIntParam(req.params.fileId);
    if (!fileId) return res.status(400).json({ error: 'Invalid file id' });

    const rows = await query(
      'SELECT id, folder_id, relative_path, mime_type FROM folder_files WHERE id = ?',
      [fileId]
    );
    if (!rows.length) return res.status(404).json({ error: 'File not found' });
    const file = rows[0];
    if (!(await canAccessFolder(req.user, file.folder_id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!String(file.mime_type || '').startsWith('video/')) {
      return res.status(400).json({ error: 'Only video files support streaming endpoint' });
    }

    let stat;
    try {
      stat = await statVerifiedFileUnderBase(storageAbsRoot, file.relative_path);
    } catch {
      return res.status(404).json({ error: 'Stored file is missing' });
    }
    const fileSize = stat.size;
    const range = req.headers.range;

    setLibrarySecurityHeaders(res);

    if (!range) {
      res.writeHead(200, {
        'Content-Type': file.mime_type,
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
      });
      let rs;
      try {
        rs = createVerifiedReadStream(storageAbsRoot, file.relative_path);
      } catch {
        return res.status(400).json({ error: 'Invalid stored path' });
      }
      rs.on('error', (e) => {
        console.error('Stream read error', e);
        if (!res.headersSent) res.status(500).end();
        else rs.destroy();
      });
      res.on('close', () => rs.destroy());
      rs.pipe(res);
      return;
    }

    const rangeParsed = parseRangeForFile(range, fileSize);
    if (rangeParsed.error) {
      return res.status(416).json({ error: rangeParsed.error });
    }
    const { start, end } = rangeParsed;

    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': file.mime_type,
    });
    let rs;
    try {
      rs = createVerifiedReadStream(storageAbsRoot, file.relative_path, { start, end });
    } catch {
      return res.status(400).json({ error: 'Invalid stored path' });
    }
    rs.on('error', (e) => {
      console.error('Stream range read error', e);
      if (!res.headersSent) res.status(500).end();
      else rs.destroy();
    });
    res.on('close', () => rs.destroy());
    rs.pipe(res);
  } catch (err) {
    console.error('Stream file error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Admin: update folder visibility
router.patch('/folders/:folderId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await initDb();
    const folderId = parsePositiveIntParam(req.params.folderId);
    const { visibility } = parseOrThrow(folderVisibilitySchema, req.body || {});
    if (!folderId) return res.status(400).json({ error: 'Invalid folder id' });
    const existingRows = await query('SELECT id FROM content_folders WHERE id = ?', [folderId]);
    if (!existingRows.length) return res.status(404).json({ error: 'Folder not found' });
    await query('UPDATE content_folders SET visibility = ? WHERE id = ?', [visibility, folderId]);
    const rows = await query('SELECT id, name, slug, parent_id, visibility FROM content_folders WHERE id = ?', [folderId]);
    return res.json({ folder: mapFolderForClient(rows[0]) });
  } catch (err) {
    if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Update folder visibility error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Admin: get access list for a folder
router.get('/folders/:folderId/access', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await initDb();
    const folderId = parsePositiveIntParam(req.params.folderId);
    if (!folderId) return res.status(400).json({ error: 'Invalid folder id' });
    const rows = await query(
      `SELECT fa.user_id
       FROM folder_access fa
       WHERE fa.folder_id = ?`,
      [folderId]
    );
    return res.json({ user_ids: rows.map((r) => r.user_id) });
  } catch (err) {
    console.error('Get folder access error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Admin: set access list (replace)
router.put('/folders/:folderId/access', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await initDb();
    const folderId = parsePositiveIntParam(req.params.folderId);
    const { user_ids: userIds } = parseOrThrow(folderAccessSchema, req.body || {});
    if (!folderId) return res.status(400).json({ error: 'Invalid folder id' });
    const folderRows = await query('SELECT id FROM content_folders WHERE id = ?', [folderId]);
    if (!folderRows.length) return res.status(404).json({ error: 'Folder not found' });

    const requested = assertPositiveIntIds(userIds);
    if (!requested.length) {
      await query('DELETE FROM folder_access WHERE folder_id = ?', [folderId]);
      return res.json({ success: true, user_ids: [] });
    }

    const empRows = await queryInList(
      'SELECT id FROM users WHERE id IN',
      requested,
      " AND role = 'employee'"
    );
    const normalized = empRows.map((r) => r.id);
    if (normalized.length > MAX_FOLDER_ACCESS_WRITES) {
      return res.status(400).json({ error: 'Too many users in access list' });
    }

    await query('DELETE FROM folder_access WHERE folder_id = ?', [folderId]);
    for (const uid of normalized) {
      // eslint-disable-next-line no-await-in-loop
      await query('INSERT IGNORE INTO folder_access (folder_id, user_id) VALUES (?, ?)', [folderId, uid]);
    }
    return res.json({ success: true, user_ids: normalized });
  } catch (err) {
    if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Set folder access error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/folders/:folderId', authMiddleware, requireAdmin, libraryMutationLimiter, async (req, res) => {
  try {
    await initDb();
    const folderId = parsePositiveIntParam(req.params.folderId);
    if (!folderId) return res.status(400).json({ error: 'Invalid folder id' });

    const rows = await query('SELECT id, slug FROM content_folders WHERE id = ?', [folderId]);
    if (!rows.length) return res.status(404).json({ error: 'Folder not found' });

    let subtreeIds;
    try {
      subtreeIds = await getSubtreeFolderIds(folderId);
    } catch (e) {
      if (e?.statusCode === 400) return res.status(400).json({ error: e.message || 'Folder tree too large' });
      throw e;
    }
    const fileRows = await queryInList(
      'SELECT relative_path FROM folder_files WHERE folder_id IN',
      subtreeIds
    );
    if (fileRows.length > MAX_FOLDER_ROWS) {
      return res.status(400).json({ error: 'Too many files in folder tree' });
    }
    for (const fr of fileRows) {
      try {
        await unlinkVerifiedFileUnderBase(storageAbsRoot, fr.relative_path);
      } catch {
        /* skip invalid stored paths */
      }
    }

    const slugRows = await queryInList(
      'SELECT slug FROM content_folders WHERE id IN',
      subtreeIds,
      ' ORDER BY LENGTH(slug) DESC'
    );
    await query('DELETE FROM content_folders WHERE id = ?', [folderId]);
    for (const { slug } of slugRows) {
      try {
        await removeLibrarySubdirIfExists(storageRoot, slug);
      } catch {
        /* skip invalid slugs */
      }
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('Delete folder error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
