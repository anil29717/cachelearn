import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import pool, { initDb, query } from './db.js';

const seedStatePath = path.resolve('storage', 'seed-users.json');

function randomString(size = 8) {
  return crypto.randomBytes(size).toString('base64url');
}

function buildSeedIdentity(prefix, name) {
  const slug = `${prefix}-${randomString(4)}`.toLowerCase();
  return {
    email: `${slug}@local.invalid`,
    password: randomString(9),
    name,
  };
}

function loadOrCreateSeedState() {
  fs.mkdirSync(path.dirname(seedStatePath), { recursive: true });
  if (fs.existsSync(seedStatePath)) {
    return JSON.parse(fs.readFileSync(seedStatePath, 'utf8'));
  }
  const state = {
    admin: buildSeedIdentity('admin', 'Demo Admin'),
    employee: buildSeedIdentity('employee', 'Demo Employee'),
  };
  fs.writeFileSync(seedStatePath, JSON.stringify(state, null, 2));
  return state;
}

const seedState = loadOrCreateSeedState();
const ADMIN_EMAIL = String(seedState.admin.email).trim().toLowerCase();
const EMPLOYEE_EMAIL = String(seedState.employee.email).trim().toLowerCase();
const ADMIN_NAME = String(seedState.admin.name || 'Demo Admin').trim();
const EMPLOYEE_NAME = String(seedState.employee.name || 'Demo Employee').trim();
const KEEP_EMAILS = [ADMIN_EMAIL, EMPLOYEE_EMAIL];

async function ensureUser(email, name, role, password) {
  const users = await query('SELECT id FROM users WHERE email = ?', [email]);
  if (users.length) return users[0].id;
  const hash = await bcrypt.hash(password, 10);
  const res = await query(
    'INSERT INTO users (email, name, role, password_hash, is_verified, is_active, created_at) VALUES (?, ?, ?, ?, 1, 1, NOW())',
    [email, name, role, hash]
  );
  return res.insertId;
}

/** Remove every user not in KEEP_EMAILS; reassign library ownership to admin. */
async function removeExtraUsers() {
  if (process.env.SEED_KEEP_ALL === '1') {
    console.log('SEED_KEEP_ALL=1 — skipping user cleanup');
    return;
  }
  const placeholders = KEEP_EMAILS.map(() => '?').join(',');
  const extra = await query(`SELECT id, email FROM users WHERE LOWER(email) NOT IN (${placeholders})`, KEEP_EMAILS);
  if (!extra.length) {
    console.log('No extra users to remove.');
    return;
  }
  const adminRows = await query('SELECT id FROM users WHERE email = ?', [ADMIN_EMAIL]);
  const adminId = adminRows[0]?.id;
  if (!adminId) {
    console.warn('Cannot clean users: admin row missing');
    return;
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const u of extra) {
      await conn.query('DELETE FROM folder_access WHERE user_id = ?', [u.id]);
      await conn.query('UPDATE folder_files SET uploaded_by = ? WHERE uploaded_by = ?', [adminId, u.id]);
      await conn.query('UPDATE content_folders SET created_by = ? WHERE created_by = ?', [adminId, u.id]);
      try {
        await conn.query('DELETE FROM email_verification_tokens WHERE user_id = ?', [u.id]);
      } catch (_) {}
      await conn.query('DELETE FROM users WHERE id = ?', [u.id]);
      console.log('Removed user:', u.email);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function run() {
  await initDb();
  const adminPass = String(seedState.admin.password || '').trim();
  const employeePass = String(seedState.employee.password || '').trim();
  if (!adminPass || !employeePass) {
    throw new Error(`Seed state is invalid. Delete ${seedStatePath} and run seed again.`);
  }

  const adminId = await ensureUser(ADMIN_EMAIL, ADMIN_NAME, 'admin', adminPass);
  const employeeId = await ensureUser(EMPLOYEE_EMAIL, EMPLOYEE_NAME, 'employee', employeePass);

  await removeExtraUsers();

  console.log('Seed completed:', {
    admin: { id: adminId, email: ADMIN_EMAIL, password: adminPass },
    employee: { id: employeeId, email: EMPLOYEE_EMAIL, password: employeePass },
  });
  console.log(`Seed credentials saved locally in ${seedStatePath}`);
}

run().catch((e) => {
  console.error('Seed error', e);
  process.exit(1);
});
