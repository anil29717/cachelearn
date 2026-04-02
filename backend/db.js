import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const required = (name) => {
  const val = process.env[name];
  if (!val || String(val).trim() === '') {
    throw new Error(`${name} must be set in environment`);
  }
  return val;
};

const pool = mysql.createPool({
  host: required('DB_HOST'),
  port: Number(required('DB_PORT')),
  user: required('DB_USER'),
  password: (() => {
    const pwd = process.env.DB_PASSWORD;
    const env = process.env.NODE_ENV || 'development';
    if (!pwd || String(pwd).trim() === '') {
      if (env === 'production') {
        throw new Error('DB_PASSWORD must be set in environment');
      }
      return '';
    }
    return pwd;
  })(),
  database: required('DB_NAME'),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
});

export async function initDb() {
  const createUsers = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'employee',
      avatar_url VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `;

  await pool.query(createUsers);

  // Active flag (block login when inactive)
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1;`);
  } catch (e) {
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1;`);
    } catch (_) {}
  }

  // Ensure verification flag exists on users (ignore error if already added)
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified TINYINT(1) NOT NULL DEFAULT 0;`);
  } catch (e) {
    // Older MySQL may not support IF NOT EXISTS; attempt without it and ignore duplicate errors
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN is_verified TINYINT(1) NOT NULL DEFAULT 0;`);
    } catch (_) {}
  }

  const createEmailVerification = `
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token VARCHAR(128) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_token (token),
      FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB;
  `;

  await pool.query(createEmailVerification);

  const createContentFolders = `
    CREATE TABLE IF NOT EXISTS content_folders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL UNIQUE,
      parent_id INT NULL,
      visibility VARCHAR(20) NOT NULL DEFAULT 'all',
      created_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (parent_id) REFERENCES content_folders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `;
  await pool.query(createContentFolders);

  // Ensure visibility exists on older DBs
  try {
    await pool.query(`ALTER TABLE content_folders ADD COLUMN visibility VARCHAR(20) NOT NULL DEFAULT 'all'`);
  } catch (_) {}

  const createFolderAccess = `
    CREATE TABLE IF NOT EXISTS folder_access (
      id INT AUTO_INCREMENT PRIMARY KEY,
      folder_id INT NOT NULL,
      user_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_folder_user (folder_id, user_id),
      FOREIGN KEY (folder_id) REFERENCES content_folders(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `;
  await pool.query(createFolderAccess);

  const createFolderFiles = `
    CREATE TABLE IF NOT EXISTS folder_files (
      id INT AUTO_INCREMENT PRIMARY KEY,
      folder_id INT NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      stored_name VARCHAR(255) NOT NULL UNIQUE,
      relative_path VARCHAR(500) NOT NULL,
      mime_type VARCHAR(150) NOT NULL,
      file_size BIGINT NOT NULL,
      uploaded_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (folder_id) REFERENCES content_folders(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    ) ENGINE=InnoDB;
  `;
  await pool.query(createFolderFiles);

  const createVideoProgress = `
    CREATE TABLE IF NOT EXISTS video_progress (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      file_id INT NOT NULL,
      watched_seconds DECIMAL(10,2) NOT NULL DEFAULT 0,
      duration_seconds DECIMAL(10,2) NOT NULL DEFAULT 0,
      max_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
      completed TINYINT(1) NOT NULL DEFAULT 0,
      completed_at TIMESTAMP NULL DEFAULT NULL,
      last_position_seconds DECIMAL(10,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_video_progress_user_file (user_id, file_id),
      KEY idx_video_progress_user (user_id),
      KEY idx_video_progress_file (file_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (file_id) REFERENCES folder_files(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `;
  await pool.query(createVideoProgress);

  // Subfolders: parent_id on content_folders (idempotent migrations)
  try {
    await pool.query('ALTER TABLE content_folders ADD COLUMN parent_id INT NULL');
  } catch (_) {}
  try {
    await pool.query(
      'ALTER TABLE content_folders ADD CONSTRAINT fk_content_folders_parent FOREIGN KEY (parent_id) REFERENCES content_folders(id) ON DELETE CASCADE'
    );
  } catch (_) {}

  const createSystemLogs = `
    CREATE TABLE IF NOT EXISTS system_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      level VARCHAR(20) NOT NULL,
      action VARCHAR(120) NOT NULL,
      message VARCHAR(2000) NULL,
      user_id INT NULL,
      ip VARCHAR(64) NULL,
      user_agent VARCHAR(512) NULL,
      meta TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_system_logs_created (created_at),
      INDEX idx_system_logs_action (action)
    ) ENGINE=InnoDB;
  `;
  await pool.query(createSystemLogs);
}

export async function query(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

export default pool;
