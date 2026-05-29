/**
 * DEV/TEST ONLY — hardcoded demo users. Does not delete other users.
 *   cd backend && node scripts/seed-demo-hardcoded.mjs
 */
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { initDb, query } from '../db.js';

dotenv.config();

const USERS = [
  { email: 'admin.demo@test.local', name: 'Demo Admin', role: 'admin', password: 'Admin@123' },
  { email: 'employee.demo@test.local', name: 'Demo Employee', role: 'employee', password: 'Employee@123' },
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
  console.log('\nLogins:\n  admin.demo@test.local / Admin@123\n  employee.demo@test.local / Employee@123\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
