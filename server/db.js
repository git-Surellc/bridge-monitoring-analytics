import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../database.sqlite');
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

  -- Drop old unique index if exists (we will replace it)
  DROP INDEX IF EXISTS idx_imports_month_structure;

  -- Create new unique index including structure_type
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

  CREATE TABLE IF NOT EXISTS ai_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT NOT NULL,
    structure_id TEXT NOT NULL,
    structure_name TEXT,
    prompt TEXT,
    status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    result TEXT,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_ai_tasks_batch_id ON ai_tasks(batch_id);
`);

// Migration: Fix schema compatibility issues
try {
  const columns = db.prepare('PRAGMA table_info(reports)').all();
  const columnNames = new Set(columns.map(col => col.name));
  
  // Check if we have the legacy 'month' column which might have NOT NULL constraint
  if (columnNames.has('month')) {
     console.log('Detected legacy reports table schema with "month" column. Migrating...');
     
     // 1. Rename old table
     const backupName = `reports_backup_${Date.now()}`;
     db.prepare(`ALTER TABLE reports RENAME TO ${backupName}`).run();
     console.log(`Renamed old reports table to ${backupName}`);
     
     // 2. Create new table with correct schema
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
     console.log('Created new reports table.');
     
     // 3. (Optional) Copy data? 
     // For now we skip copying as the schema is very different and reports are transient.
  } else {
    // Standard migration for missing columns in correct schema
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
