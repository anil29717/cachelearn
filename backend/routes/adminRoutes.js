import express from 'express';
import bcrypt from 'bcryptjs';
import pool, { initDb, query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { logEvent } from '../logger.js';
import { createEmployeeSchema, parseOrThrow } from '../validation.js';

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

function buildFolderPath(byId, folderId) {
  const parts = [];
  let cur = byId.get(folderId);
  while (cur) {
    parts.unshift(cur.name);
    cur = cur.parent_id != null ? byId.get(cur.parent_id) : null;
  }
  return parts.join(' / ');
}

// List users (admin only) — includes per-user restricted folder assignments for employees
router.get('/users', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    await initDb();
    const rows = await query('SELECT id, email, name, role, is_active, avatar_url, created_at FROM users ORDER BY created_at DESC');
    for (const u of rows) {
      u.is_active = Number(u.is_active) === 1 ? 1 : 0;
    }

    const folderRows = await query(
      'SELECT id, name, parent_id, visibility FROM content_folders'
    );
    const byId = new Map(folderRows.map((f) => [f.id, f]));
    const openFoldersCount = folderRows.filter((f) => String(f.visibility || 'all') === 'all').length;

    const accessRows = await query(
      `SELECT fa.user_id, fa.folder_id
       FROM folder_access fa`
    );

    const restrictedByUser = {};
    for (const r of accessRows) {
      if (!restrictedByUser[r.user_id]) restrictedByUser[r.user_id] = [];
      restrictedByUser[r.user_id].push({
        folder_id: r.folder_id,
        path: buildFolderPath(byId, r.folder_id),
      });
    }

    for (const u of rows) {
      u.restricted_folder_access = restrictedByUser[u.id] || [];
    }

    return res.json({ users: rows, open_folders_count: openFoldersCount });
  } catch (err) {
    console.error('Admin list users error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Create employee (admin only)
router.post('/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await initDb();
    const { email, password, name } = parseOrThrow(createEmployeeSchema, req.body || {});

    const existing = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) return res.status(409).json({ error: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, 10);
    const result = await query(
      'INSERT INTO users (email, password_hash, name, role, is_verified, is_active) VALUES (?, ?, ?, ?, 1, 1)',
      [email, password_hash, name, 'employee']
    );
    const rows = await query(
      'SELECT id, email, name, role, is_active, avatar_url, created_at FROM users WHERE id = ?',
      [result.insertId]
    );
    const created = rows[0];
    if (created) created.is_active = Number(created.is_active) === 1 ? 1 : 0;
    await logEvent({
      action: 'admin_create_employee',
      message: `Created employee ${email}`,
      userId: req.user.id,
      req,
      meta: { new_user_id: created?.id },
    });
    return res.status(201).json({ user: created });
  } catch (err) {
    if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Admin create user error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// System logs (admin only)
router.get('/logs', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await initDb();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const logs = await query(
      'SELECT id, level, action, message, user_id, ip, user_agent, meta, created_at FROM system_logs ORDER BY id DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    const [countRow] = await query('SELECT COUNT(*) as c FROM system_logs');
    return res.json({
      logs,
      total: Number(countRow?.c || 0),
      page,
      limit,
    });
  } catch (err) {
    console.error('Admin logs error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Toggle active status (admin only)
router.patch('/users/:id/status', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await initDb();
    const id = Number(req.params.id);
    const raw = req.body?.is_active;
    let is_active;
    if (typeof raw === 'boolean') is_active = raw;
    else if (typeof raw === 'number' && !Number.isNaN(raw)) is_active = raw === 1;
    else if (raw === '1' || raw === '0') is_active = raw === '1';
    else if (raw === 'true' || raw === 'false') is_active = raw === 'true';
    else if (typeof raw === 'string') {
      const s = raw.trim().toLowerCase();
      if (s === '1' || s === 'true') is_active = true;
      else if (s === '0' || s === 'false') is_active = false;
      else return res.status(400).json({ error: 'is_active must be boolean or 0/1' });
    } else {
      return res.status(400).json({ error: 'is_active must be boolean or 0/1' });
    }
    if (!id) return res.status(400).json({ error: 'Invalid user id' });
    if (Number(req.user?.id) === id) return res.status(400).json({ error: 'You cannot deactivate yourself', code: 'SELF_DEACTIVATE' });

    const userRows = await query('SELECT id, role FROM users WHERE id = ?', [id]);
    if (!userRows.length) return res.status(404).json({ error: 'User not found' });
    const u = userRows[0];
    if (u.role === 'admin' && !is_active) {
      const [adminCount] = await query("SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND is_active = 1");
      const count = Number(adminCount?.c || 0);
      if (count <= 1) {
        return res.status(400).json({ error: 'Cannot deactivate the last active admin', code: 'LAST_ADMIN' });
      }
    }

    await query('UPDATE users SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, id]);
    const rows = await query('SELECT id, email, name, role, is_active, avatar_url, created_at FROM users WHERE id = ?', [id]);
    const updated = rows[0];
    if (updated) updated.is_active = Number(updated.is_active) === 1 ? 1 : 0;
    return res.json({ user: updated });
  } catch (err) {
    console.error('Admin update user status error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Delete user (admin only)
router.delete('/users/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await initDb();
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });
    if (Number(req.user?.id) === id) return res.status(400).json({ error: 'You cannot delete yourself', code: 'SELF_DELETE' });

    const userRows = await query('SELECT id, role FROM users WHERE id = ?', [id]);
    if (!userRows.length) return res.status(404).json({ error: 'User not found' });
    const user = userRows[0];

    if (user.role === 'admin') {
      const [adminCount] = await query("SELECT COUNT(*) as c FROM users WHERE role = 'admin'");
      const count = Number(adminCount?.c || 0);
      if (count <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last remaining admin', code: 'LAST_ADMIN' });
      }
    }

    const adminId = req.user.id;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM folder_access WHERE user_id = ?', [id]);
      await conn.query('UPDATE folder_files SET uploaded_by = ? WHERE uploaded_by = ?', [adminId, id]);
      await conn.query('UPDATE content_folders SET created_by = ? WHERE created_by = ?', [adminId, id]);
      await conn.query('DELETE FROM email_verification_tokens WHERE user_id = ?', [id]);
      await conn.query('DELETE FROM users WHERE id = ?', [id]);
      await conn.commit();
      await logEvent({
        action: 'admin_delete_user',
        message: `Deleted user id ${id}`,
        userId: req.user.id,
        req,
        meta: { deleted_id: id },
      });
      return res.json({ success: true });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Admin delete user error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// User summary (admin only) for hover details
router.get('/users/:id/summary', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await initDb();
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });

    const userRows = await query('SELECT id, email, name, role, avatar_url, created_at FROM users WHERE id = ?', [id]);
    if (!userRows.length) return res.status(404).json({ error: 'User not found' });
    const user = userRows[0];

    const [grantedFolders] = await query('SELECT COUNT(*) as c FROM folder_access WHERE user_id = ?', [id]);
    const [uploadedFiles] = await query('SELECT COUNT(*) as c FROM folder_files WHERE uploaded_by = ?', [id]);
    const [createdFolders] = await query('SELECT COUNT(*) as c FROM content_folders WHERE created_by = ?', [id]);

    const summary = {
      user,
      granted_folders_count: Number(grantedFolders?.c || 0),
      uploaded_files_count: Number(uploadedFiles?.c || 0),
      created_folders_count: Number(createdFolders?.c || 0),
    };

    return res.json({ summary });
  } catch (err) {
    console.error('Admin user summary error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/users/:id/video-progress', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await initDb();
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });

    const userRows = await query('SELECT id, email, name, role FROM users WHERE id = ?', [id]);
    if (!userRows.length) return res.status(404).json({ error: 'User not found' });

    const progress = await query(
      `SELECT vp.user_id, vp.file_id, vp.watched_seconds, vp.duration_seconds, vp.max_percent, vp.completed,
              vp.completed_at, vp.last_position_seconds, vp.updated_at,
              ff.original_name, ff.mime_type, ff.folder_id, cf.name AS folder_name
       FROM video_progress vp
       JOIN folder_files ff ON ff.id = vp.file_id
       JOIN content_folders cf ON cf.id = ff.folder_id
       WHERE vp.user_id = ?
       ORDER BY vp.updated_at DESC, ff.original_name ASC`,
      [id]
    );

    return res.json({
      user: userRows[0],
      progress,
    });
  } catch (err) {
    console.error('Admin video progress error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Stats (admin only)
router.get('/stats', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    await initDb();
    const [usersCount] = await query('SELECT COUNT(*) as c FROM users');
    const [employeesCount] = await query("SELECT COUNT(*) as c FROM users WHERE role = 'employee'");
    const [foldersCount] = await query('SELECT COUNT(*) as c FROM content_folders');
    const [filesCount] = await query('SELECT COUNT(*) as c FROM folder_files');

    const stats = {
      total_users: Number(usersCount?.c || 0),
      total_employees: Number(employeesCount?.c || 0),
      total_folders: Number(foldersCount?.c || 0),
      total_files: Number(filesCount?.c || 0),
    };
    return res.json({ stats });
  } catch (err) {
    console.error('Admin stats error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Internal platform summary (admin only)
router.get('/summary', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    await initDb();
    const [employeesCount] = await query("SELECT COUNT(*) as c FROM users WHERE role = 'employee'");
    const [filesCount] = await query('SELECT COUNT(*) as c FROM folder_files');
    const recentUploads = await query(
      `SELECT ff.id, ff.original_name, ff.mime_type, ff.file_size, ff.created_at, cf.name AS folder_name
       FROM folder_files ff
       JOIN content_folders cf ON cf.id = ff.folder_id
       ORDER BY ff.created_at DESC
       LIMIT 10`
    );

    return res.json({
      summary: {
        total_employees: Number(employeesCount?.c || 0),
        total_files: Number(filesCount?.c || 0),
        recent_uploads: recentUploads,
      },
    });
  } catch (err) {
    console.error('Admin summary error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
