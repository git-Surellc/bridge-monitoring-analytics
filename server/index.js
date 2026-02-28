import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import fs from 'fs';
import { startImportTask, getImportStatus, retryImport } from './importer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

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
