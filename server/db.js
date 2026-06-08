import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use DATABASE_PATH from environment or default to relative path
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../database.sqlite');
console.log('Database path:', dbPath);

const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    structure_id TEXT NOT NULL,
    structure_name TEXT,
    structure_type TEXT,
    status TEXT DEFAULT 'pending', -- pending, success, error
    file_path TEXT,
    error_msg TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_imports_month_structure_type ON imports (month, structure_id, structure_type);

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT,
    name TEXT,
    status TEXT DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    file_path TEXT,
    error_msg TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migration: Fix schema compatibility issues
try {
  const columns = db.prepare('PRAGMA table_info(reports)').all();
  const columnNames = new Set(columns.map(col => col.name));

  if (columnNames.has('month')) {
    const rowCount = db.prepare('SELECT COUNT(*) AS n FROM reports').get().n;
    if (rowCount > 0) {
      // Drop any old backup tables, keep at most 1 fresh one
      const oldBackups = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'reports_backup_%'"
      ).all();
      for (const t of oldBackups) {
        db.prepare(`DROP TABLE IF EXISTS "${t.name}"`).run();
      }

      const backupName = `reports_backup_${Date.now()}`;
      db.prepare(`ALTER TABLE reports RENAME TO ${backupName}`).run();
      console.log(`Detected legacy reports schema with ${rowCount} rows. Backed up to ${backupName}.`);

      db.exec(`
        CREATE TABLE IF NOT EXISTS reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id TEXT,
          name TEXT,
          status TEXT DEFAULT 'pending',
          progress INTEGER DEFAULT 0,
          file_path TEXT,
          error_msg TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } else {
      // Old schema but no data — just drop and recreate
      db.prepare('DROP TABLE reports').run();
      db.exec(`
        CREATE TABLE IF NOT EXISTS reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id TEXT,
          name TEXT,
          status TEXT DEFAULT 'pending',
          progress INTEGER DEFAULT 0,
          file_path TEXT,
          error_msg TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
    }
  } else {
    const requiredColumns = [
      { name: 'task_id', type: 'TEXT' },
      { name: 'name', type: 'TEXT' },
      { name: 'status', type: "TEXT DEFAULT 'pending'" },
      { name: 'progress', type: 'INTEGER DEFAULT 0' },
      { name: 'file_path', type: 'TEXT' },
      { name: 'error_msg', type: 'TEXT' }
    ];

    for (const col of requiredColumns) {
      if (!columnNames.has(col.name)) {
        console.log(`Migrating reports table: Adding ${col.name} column...`);
        db.prepare(`ALTER TABLE reports ADD COLUMN ${col.name} ${col.type}`).run();
      }
    }
  }
} catch (err) {
  console.error('Migration error:', err);
}

export default db;
