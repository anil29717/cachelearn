import fs from 'fs';
import path from 'path';
import { getSafePathUnderBase } from '../utils/safePaths.js';

const APP_ROOT = path.resolve(process.cwd());
export const appRoot = APP_ROOT;
export const storageAbsRoot = getSafePathUnderBase(APP_ROOT, 'storage');
export const libraryStorageRoot = getSafePathUnderBase(storageAbsRoot, 'library');

fs.mkdirSync(libraryStorageRoot, { recursive: true });

/** Fixed seed state path under storage/ (no user input). */
export function getSeedStatePath() {
  return getSafePathUnderBase(storageAbsRoot, 'seed-users.json');
}
