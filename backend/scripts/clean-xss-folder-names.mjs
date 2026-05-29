/**
 * One-time cleanup: strip HTML from existing folder/file display names in DB.
 *   cd backend && node scripts/clean-xss-folder-names.mjs
 */
import dotenv from 'dotenv';
import { initDb, query } from '../db.js';
import { sanitizeDisplayName } from '../utils/safeDisplay.js';

dotenv.config();

async function main() {
  await initDb();
  const folders = await query('SELECT id, name FROM content_folders');
  let folderUpdates = 0;
  for (const f of folders) {
    const clean = sanitizeDisplayName(f.name, 120);
    if (clean !== f.name) {
      await query('UPDATE content_folders SET name = ? WHERE id = ?', [clean || 'Folder', f.id]);
      folderUpdates += 1;
      console.log(`Folder ${f.id}: "${f.name}" -> "${clean || 'Folder'}"`);
    }
  }
  const files = await query('SELECT id, original_name FROM folder_files');
  let fileUpdates = 0;
  for (const file of files) {
    const clean = sanitizeDisplayName(file.original_name, 255);
    if (clean !== file.original_name) {
      await query('UPDATE folder_files SET original_name = ? WHERE id = ?', [clean || 'file', file.id]);
      fileUpdates += 1;
      console.log(`File ${file.id}: sanitized original_name`);
    }
  }
  console.log(`Done. Updated ${folderUpdates} folder(s), ${fileUpdates} file(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
