import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { generateWordReport } from './report/generator.js';
import { startImportTask, getImportStatus, retryImport, getActiveTask } from './importer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8888;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

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

// Get active task
app.get('/api/import/active', (req, res) => {
  try {
    const task = getActiveTask();
    if (task) {
      res.json(task);
    } else {
      res.status(404).json({ message: 'No active task' });
    }
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

// Admin: Clear All Database
app.delete('/api/admin/clear-database', (req, res) => {
  try {
    // 1. Delete all records from imports table
    db.prepare('DELETE FROM imports').run();

    // 2. Delete all files in excel directory
    const files = fs.readdirSync(EXCEL_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(EXCEL_DIR, file));
    }
    
    // 3. Reset auto-increment (optional but good for clean slate)
    db.prepare("DELETE FROM sqlite_sequence WHERE name='imports'").run();

    res.json({ message: 'Database cleared and all files deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Report Generation Task Storage
const reportTasks = new Map();

app.post('/api/reports/generate', async (req, res) => {
  try {
    const { bridges, cover, sections } = req.body;
    if (!bridges || !Array.isArray(bridges)) {
      return res.status(400).json({ error: 'Invalid data' });
    }

    const taskId = uuidv4();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `Report_${timestamp}_${taskId.slice(0, 8)}.docx`;
    const filePath = path.join(REPORT_DIR, fileName);

    // Initial status
    reportTasks.set(taskId, { 
      status: 'pending', 
      progress: 0, 
      startTime: Date.now() 
    });

    // Start background processing
    (async () => {
      try {
        reportTasks.set(taskId, { status: 'processing', progress: 10 });
        
        // Generate Report
        const buffer = await generateWordReport(bridges, cover, sections, (progress) => {
           reportTasks.set(taskId, { 
             status: 'processing', 
             progress,
             startTime: reportTasks.get(taskId)?.startTime 
           });
        });
        
        // Write to disk
        fs.writeFileSync(filePath, buffer);
        
        // Update status
        reportTasks.set(taskId, { 
          status: 'completed', 
          progress: 100, 
          downloadUrl: `/api/reports/download/${fileName}`,
          fileName: fileName
        });

        // Cleanup task after 1 hour
        setTimeout(() => {
          reportTasks.delete(taskId);
        }, 3600000);

      } catch (err) {
        console.error('Report generation failed:', err);
        reportTasks.set(taskId, { status: 'failed', error: err.message });
      }
    })();

    res.json({ taskId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/task/:id', (req, res) => {
  const task = reportTasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

app.get('/api/reports/download/:filename', (req, res) => {
  const filePath = path.join(REPORT_DIR, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
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
