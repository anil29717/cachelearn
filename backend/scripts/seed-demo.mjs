/**
 * DEV/TEST ONLY — demo users from environment (passwords never in source).
 *   Set SEED_ADMIN_PASSWORD and SEED_EMPLOYEE_PASSWORD in backend/.env, then:
 *   cd backend && npm run seed:demo
 */
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { initDb, query } from '../db.js';

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (value && String(value).trim()) return String(value).trim();
  throw new Error(
    `Set ${name} in backend/.env (or the environment). Passwords are not stored in this repo.`
  );
}

const USERS = [
  {
    email: 'admin.demo@test.local',
    name: 'Demo Admin',
    role: 'admin',
    password: requireEnv('SEED_ADMIN_PASSWORD'),
  },
  {
    email: 'employee.demo@test.local',
    name: 'Demo Employee',
    role: 'employee',
    password: requireEnv('SEED_EMPLOYEE_PASSWORD'),
  },
];

async function upsert({ email, name, role, password }) {
  const hash = await bcrypt.hash(password, 10);
  const rows = await query('SELECT id FROM users WHERE email = ?', [email]);
  if (rows.length) {
    await query(
      'UPDATE users SET name = ?, role = ?, password_hash = ?, is_verified = 1, is_active = 1 WHERE email = ?',
      [name, role, hash, email]
    );
    console.log(`Updated ${role}: ${email}`);
    return;
  }
  await query(
    'INSERT INTO users (email, name, role, password_hash, is_verified, is_active, created_at) VALUES (?, ?, ?, ?, 1, 1, NOW())',
    [email, name, role, hash]
  );
  console.log(`Created ${role}: ${email}`);
}

async function main() {
  await initDb();
  for (const u of USERS) await upsert(u);
  console.log('\nDemo users ready (passwords from SEED_* env vars, not logged):\n');
  for (const { email, role } of USERS) console.log(`  ${role}: ${email}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
