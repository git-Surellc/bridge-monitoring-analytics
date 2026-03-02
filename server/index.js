import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import fs from 'fs';
import { startImportTask, getImportStatus, retryImport } from './importer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8888;

app.use(cors());
app.use(express.json());

// Ensure storage directories exist
const STORAGE_DIR = path.join(__dirname, '../storage');
const EXCEL_DIR = path.join(STORAGE_DIR, 'excel');
const REPORT_DIR = path.join(STORAGE_DIR, 'reports');

if (!fs.existsSync(EXCEL_DIR)) fs.mkdirSync(EXCEL_DIR, { recursive: true });
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

// API Routes

// Start import task
app.post('/api/import/start', async (req, res) => {
  const { month, structures } = req.body;
  if (!month || !structures || !Array.isArray(structures)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  try {
    const cookie = req.headers.cookie;
    startImportTask(month, structures, cookie);
    res.json({ message: 'Import task started', month });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get import status
app.get('/api/import/status', (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'Month is required' });
  
  const status = getImportStatus(month);
  res.json(status);
});

// Retry specific item
app.post('/api/import/retry', async (req, res) => {
  const { month, structureId } = req.body;
  if (!month || !structureId) return res.status(400).json({ error: 'Invalid parameters' });

  try {
    await retryImport(month, structureId);
    res.json({ message: 'Retry initiated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// File Management APIs
app.get('/api/files', (req, res) => {
  try {
    const files = db.prepare('SELECT * FROM imports ORDER BY created_at DESC').all();
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/files/:id', (req, res) => {
  const { id } = req.params;
  try {
    const file = db.prepare('SELECT * FROM imports WHERE id = ?').get(id);
    if (!file) return res.status(404).json({ error: 'File not found' });

    // Delete from disk
    if (file.file_path && fs.existsSync(file.file_path)) {
      fs.unlinkSync(file.file_path);
    }

    // Delete from DB
    db.prepare('DELETE FROM imports WHERE id = ?').run(id);
    
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Fix Filenames (Migration)
app.post('/api/admin/fix-filenames', (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM imports WHERE status = 'success' AND file_path IS NOT NULL").all();
    let updatedCount = 0;
    let errors = [];

    for (const row of rows) {
      if (!fs.existsSync(row.file_path)) {
        errors.push(`File not found for ID ${row.id}: ${row.file_path}`);
        continue;
      }

      const dir = path.dirname(row.file_path);
      const ext = path.extname(row.file_path);
      
      // New filename format: StructureName_Month_ID.xlsx
      // Sanitize filename to remove invalid characters
      const safeName = (row.structure_name || 'Unknown').replace(/[\/\\:*?"<>|]/g, '_');
      const month = row.month || '2024-02'; // Default to Feb 2024 if missing
      const newFileName = `${safeName}_${month}_${row.structure_id}${ext}`;
      const newFilePath = path.join(dir, newFileName);

      // Skip if name is already correct
      if (path.basename(row.file_path) === newFileName) continue;

      try {
        fs.renameSync(row.file_path, newFilePath);
        db.prepare('UPDATE imports SET file_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(newFilePath, row.id);
        updatedCount++;
      } catch (err) {
        errors.push(`Failed to rename ID ${row.id}: ${err.message}`);
      }
    }

    res.json({ 
      message: `Processed ${rows.length} files. Updated ${updatedCount} filenames.`,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve storage files (for download)
app.use('/storage', express.static(STORAGE_DIR));

const DIST_DIR = path.join(__dirname, '../dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/storage')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
