import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { generateWordReport } from './report/generator.js';
import { startImportTask, getImportStatus, retryImport, getActiveTask, stopImportTask } from './importer.js';

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
    const tokenRow = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('api_token');
    const token = tokenRow ? tokenRow.value : null;
    
    startImportTask(month, structures, token);
    res.json({ message: 'Import task started', month });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop import task
app.post('/api/import/stop', (req, res) => {
  const { month } = req.body;
  if (!month) return res.status(400).json({ error: 'Month is required' });

  if (stopImportTask(month)) {
    res.json({ message: 'Task stopped' });
  } else {
    res.status(404).json({ error: 'No active task found for this month' });
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

// Auth & Settings API
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and Password required' });

  try {
    // 1. Encrypt Password
    const suffix = Math.floor(100000 + Math.random() * 900000);
    const encryptUrl = `http://cdsd.seefar.com.cn/prod-api/getPw?password=${password}${suffix}`;
    
    const encryptRes = await fetch(encryptUrl);
    if (!encryptRes.ok) throw new Error(`Encryption failed: ${encryptRes.status}`);
    const encryptData = await encryptRes.json();
    
    if (encryptData.code !== 200) throw new Error(encryptData.msg || 'Encryption API error');
    const encryptedPassword = encryptData.msg;

    // 2. Login
    const loginUrl = 'http://cdsd.seefar.com.cn/prod-api/login';
    const loginRes = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: encryptedPassword })
    });

    if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
    const loginData = await loginRes.json();
    
    if (loginData.code !== 200) throw new Error(loginData.msg || 'Login API error');
    const token = loginData.token;

    // 3. Save to DB
    const stmt = db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
    stmt.run('api_token', token);
    stmt.run('api_username', username);

    res.json({ success: true, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/status', (req, res) => {
  try {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('api_token');
    const userRow = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('api_username');
    res.json({ 
      hasToken: !!row,
      username: userRow ? userRow.value : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Device Status API
app.post('/api/devices/status', async (req, res) => {
  const { structures, devicesByStructure } = req.body;
  
  try {
    const tokenRow = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('api_token');
    if (!tokenRow) return res.status(401).json({ error: 'No API token found. Please login first.' });
    const token = tokenRow.value;

    const localByStructureId = new Map();
    if (Array.isArray(devicesByStructure)) {
      for (const item of devicesByStructure) {
        const id = item?.id;
        const devices = Array.isArray(item?.devices) ? item.devices : [];
        const nameToType = new Map();
        const totalsByType = {};

        for (const d of devices) {
          const n = String(d?.name || '').trim();
          if (!n) continue;
          const t = d?.deviceType ? String(d.deviceType).trim() : '';
          if (t) {
            nameToType.set(n, t);
            totalsByType[t] = (totalsByType[t] || 0) + 1;
          }
        }

        if (id) {
          localByStructureId.set(id, { nameToType, totalsByType });
        }
      }
    }

    const results = [];
    const targetStructures = (structures && Array.isArray(structures)) ? structures : [];

    for (const struct of targetStructures) {
      try {
        const url = new URL('http://cdsd.seefar.com.cn/prod-api/monitor-monitoring-point/sensorList');
        url.searchParams.append('pageNum', '1');
        url.searchParams.append('pageSize', '100'); // Increased limit
        url.searchParams.append('structureName', struct.name);
        url.searchParams.append('structureType', struct.type || '1');
        // Removed pointName filter to try to get all devices
        // url.searchParams.append('pointName', '一体化倾角振动监测仪'); 
        url.searchParams.append('status', '');

        const response = await fetch(url.toString(), {
          headers: { 'Authorization': token }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.code === 200 && data.records) {
             const sensors = data.records;
             let latestTime = null;
             let hasAbnormal = false;

             const deviceMap = {};
             let onlineCount = 0;
             let totalCount = sensors.length;

             for (const sensor of sensors) {
               const name = String(sensor.pointName || sensor.name || sensor.sensorName || '').trim();
               const isOnline = sensor.lastOnlineTime && (Date.now() - new Date(sensor.lastOnlineTime).getTime() < 2 * 60 * 60 * 1000);

               if (sensor.status !== '0') hasAbnormal = true;
               if (sensor.lastOnlineTime) {
                 const time = new Date(sensor.lastOnlineTime).getTime();
                 if (!latestTime || time > latestTime) latestTime = time;
               }

               if (isOnline) onlineCount++;

               deviceMap[name] = {
                 status: isOnline ? 'online' : 'offline',
                 lastOnlineTime: sensor.lastOnlineTime
               };
             }

             results.push({
               id: struct.id,
               name: struct.name,
               status: onlineCount > 0 ? (hasAbnormal ? 'warning' : 'online') : 'offline',
               lastUpdate: latestTime ? new Date(latestTime).toLocaleString() : 'Never',
               deviceMap,
               stats: {
                 total: totalCount,
                 online: onlineCount
               }
             });
          } else {
             results.push({ id: struct.id, name: struct.name, status: 'offline', lastUpdate: '-', stats: { total: 0, online: 0 } });
          }
        } else {
           results.push({ id: struct.id, name: struct.name, status: 'error', lastUpdate: '-', stats: { total: 0, online: 0 } });
        }
      } catch (err) {
        console.error(`Failed to fetch status for ${struct.name}:`, err);
        results.push({ id: struct.id, name: struct.name, status: 'error', lastUpdate: '-', stats: { total: 0, online: 0 } });
      }
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reports API
app.get('/api/reports', (req, res) => {
  try {
    const reports = db.prepare('SELECT * FROM reports ORDER BY created_at DESC').all();
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/reports/:id', (req, res) => {
  const { id } = req.params;
  try {
    const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    if (report.file_path && fs.existsSync(report.file_path)) {
      fs.unlinkSync(report.file_path);
    }
    
    db.prepare('DELETE FROM reports WHERE id = ?').run(id);
    res.json({ message: 'Report deleted' });
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

app.get('/api/files/download/:filename', (req, res) => {
  try {
    const filePath = path.join(EXCEL_DIR, req.params.filename);
    if (fs.existsSync(filePath)) {
      return res.download(filePath);
    }
    return res.status(404).json({ error: 'File not found' });
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
// const reportTasks = new Map(); // Deprecated in favor of DB

app.post('/api/reports/generate', async (req, res) => {
  try {
    const { bridges, cover, sections, deviceStatuses } = req.body;
    if (!bridges || !Array.isArray(bridges)) {
      return res.status(400).json({ error: 'Invalid data' });
    }

    const taskId = uuidv4();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `Report_${timestamp}_${taskId.slice(0, 8)}.docx`;
    const filePath = path.join(REPORT_DIR, fileName);
    const reportName = (cover && cover.title) ? cover.title : `监测报告_${new Date().toLocaleDateString()}`;

    // 1. Insert into DB
    const stmt = db.prepare('INSERT INTO reports (task_id, name, status, progress, file_path) VALUES (?, ?, ?, ?, ?)');
    const result = stmt.run(taskId, reportName, 'pending', 0, filePath);
    const reportId = result.lastInsertRowid;

    // Start background processing
    (async () => {
      try {
        db.prepare('UPDATE reports SET status = ?, progress = ? WHERE id = ?').run('processing', 10, reportId);
        
        // Generate Report
        const buffer = await generateWordReport(bridges, cover, sections, deviceStatuses, (progress) => {
           db.prepare('UPDATE reports SET progress = ? WHERE id = ?').run(progress, reportId);
        });
        
        // Write to disk
        fs.writeFileSync(filePath, buffer);
        
        // Update status
        db.prepare('UPDATE reports SET status = ?, progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('completed', 100, reportId);

      } catch (err) {
        console.error('Report generation failed:', err);
        db.prepare('UPDATE reports SET status = ?, error_msg = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('failed', err.message, reportId);
      }
    })();

    res.json({ taskId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/task/:id', (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM reports WHERE task_id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    
    res.json({
      status: task.status,
      progress: task.progress,
      downloadUrl: task.status === 'completed' ? `/api/reports/download/${path.basename(task.file_path)}` : null,
      error: task.error_msg,
      fileName: task.file_path ? path.basename(task.file_path) : 'unknown.docx'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/download/:filename', (req, res) => {
  const filePath = path.join(REPORT_DIR, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.get('/api/files/download/:filename', (req, res) => {
  const filePath = path.join(EXCEL_DIR, req.params.filename);
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
