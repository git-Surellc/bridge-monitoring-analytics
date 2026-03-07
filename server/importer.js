import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEL_DIR = path.join(__dirname, '../storage/excel');

// Ensure directory exists
if (!fs.existsSync(EXCEL_DIR)) {
  fs.mkdirSync(EXCEL_DIR, { recursive: true });
}

// In-memory task tracking
const activeTasks = new Map(); // month -> { status, progress, total, success, fail, logs: [] }

export const startImportTask = (month, structures, token) => {
  if (activeTasks.has(month)) {
    const task = activeTasks.get(month);
    if (task.status === 'running') {
      // Task is already running, just return
      return;
    }
  }

  // Initialize task
  const task = {
    status: 'running',
    progress: 0,
    total: structures.length,
    success: 0,
    fail: 0,
    logs: []
  };
  activeTasks.set(month, task);

  // Run async
  processImport(month, structures, task, token);
};

async function processImport(month, structures, task, token) {
  try {
    for (const item of structures) {
      if (task.status === 'stopped') break;

      // Check DB using month + structure_id + structure_type
      const existing = db.prepare('SELECT * FROM imports WHERE month = ? AND structure_id = ? AND structure_type = ?').get(month, item.id, item.type);
      
      if (existing && existing.status === 'success' && existing.file_path && fs.existsSync(existing.file_path)) {
        // Update metadata even if skipping download (to backfill names)
        db.prepare('UPDATE imports SET structure_name = ?, structure_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(item.name, item.type, existing.id);

        const downloadUrl = `/storage/excel/${path.basename(existing.file_path)}`;

        task.success++;
        task.progress++;
        task.logs.push({ 
          id: item.id, 
          type: item.type,
          name: item.name,
          status: 'skipped', 
          msg: `已存在 (无需请求): ${item.name}`,
          fromCache: true,
          downloadUrl
        });
        continue;
      }

      // Fetch
      try {
        const url = `http://cdsd.seefar.com.cn/prod-api/monitor-monitoring-point/exportMonthData?month=${month}&structureType=${item.type}&structureId=${item.id}`;
        
        const headers = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Authorization': token || ''
        };

        const response = await fetch(url, { headers });
        
        if (!response.ok) {
           let errorDetail = '';
           try {
             const errorText = await response.text();
             try {
               const errorJson = JSON.parse(errorText);
               errorDetail = errorJson.msg || errorJson.message || JSON.stringify(errorJson);
             } catch {
               errorDetail = errorText.slice(0, 200);
             }
           } catch (e) {
             errorDetail = '无法读取响应内容';
           }
           throw new Error(`请求失败 (${response.status}): ${errorDetail || response.statusText}`);
        }
        
        // Save file
        const buffer = await response.arrayBuffer();
        
        // Check for small error response (sometimes API returns JSON error with 200 OK)
        if (buffer.byteLength < 500) { 
           const text = new TextDecoder().decode(buffer);
           try {
             const json = JSON.parse(text);
             if (json.code && json.code !== 200) {
                throw new Error(json.msg || 'API returned error JSON');
             }
           } catch (e) {
             // Not JSON, assume valid file content
           }
        }

        const fileName = `${item.name}_${month}_${item.id}.xlsx`;
        const filePath = path.join(EXCEL_DIR, fileName);
        fs.writeFileSync(filePath, Buffer.from(buffer));
        
        const downloadUrl = `/storage/excel/${fileName}`;

        // Update DB
        if (existing) {
          db.prepare('UPDATE imports SET status = ?, file_path = ?, structure_name = ?, structure_type = ?, updated_at = CURRENT_TIMESTAMP, error_msg = NULL WHERE id = ?')
            .run('success', filePath, item.name, item.type, existing.id);
        } else {
          db.prepare('INSERT INTO imports (month, structure_id, structure_name, structure_type, status, file_path) VALUES (?, ?, ?, ?, ?, ?)')
            .run(month, item.id, item.name, item.type, 'success', filePath);
        }

        task.success++;
        task.logs.push({ id: item.id, type: item.type, name: item.name, status: 'success', msg: `下载成功: ${item.name}`, downloadUrl });

      } catch (err) {
        task.fail++;
        task.logs.push({ id: item.id, type: item.type, name: item.name, status: 'error', msg: `失败: ${item.name} - ${err.message}` });
        
        // Record error in DB
        if (existing) {
          db.prepare('UPDATE imports SET status = ?, error_msg = ?, structure_name = ?, structure_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run('error', err.message, item.name, item.type, existing.id);
        } else {
          db.prepare('INSERT INTO imports (month, structure_id, structure_name, structure_type, status, error_msg) VALUES (?, ?, ?, ?, ?, ?)')
            .run(month, item.id, item.name, item.type, 'error', err.message);
        }
      }
      
      task.progress++;
    }
    
    if (task.status !== 'stopped') {
      task.status = 'completed';
    }
  } catch (fatal) {
    task.status = 'failed';
    task.error = fatal.message;
  }
};

export const stopImportTask = (month) => {
  if (activeTasks.has(month)) {
    const task = activeTasks.get(month);
    if (task.status === 'running') {
      task.status = 'stopped';
      task.logs.push({ 
        id: 'system', 
        type: 'system', 
        status: 'warning', 
        msg: '用户手动停止了任务' 
      });
      return true;
    }
  }
  return false;
};

export const getActiveTask = () => {
  for (const [month, task] of activeTasks.entries()) {
    if (task.status === 'running') {
      return { month, ...task };
    }
  }
  return null;
};

export const getImportStatus = (month) => {
  const task = activeTasks.get(month);
  if (task) return task;
  
  if (!month) return { status: 'idle' };

  // If no active task, check DB for summary
  const rows = db.prepare('SELECT * FROM imports WHERE month = ? ORDER BY structure_id ASC').all(month);
  const total = rows.length;
  
  if (total > 0) {
      const success = rows.filter(r => r.status === 'success').length;
      const fail = rows.filter(r => r.status === 'error').length;
      
      // Reconstruct logs from DB
      const logs = rows.map(row => ({
        id: row.structure_id,
        type: row.structure_type,
        name: row.structure_name,
        status: row.status === 'success' ? 'success' : 'error',
        msg: row.status === 'success' ? '已完成' : (row.error_msg || '未知错误'),
        downloadUrl: row.file_path ? `/storage/excel/${path.basename(row.file_path)}` : null,
        fromCache: true
      }));

      return { status: 'completed', progress: total, total, success, fail, logs };
  }
  
  return { status: 'idle' };
};

export const retryImport = async (month, structureId) => {
  const item = db.prepare('SELECT * FROM imports WHERE month = ? AND structure_id = ?').get(month, structureId);
  if (!item) throw new Error('Item not found');

  // Reset status
  db.prepare('UPDATE imports SET status = ? WHERE id = ?').run('pending', item.id);
  
  // Trigger single item fetch
  // This should ideally be part of a task or run immediately
  // For now, let's just run it immediately
  try {
        const url = `http://cdsd.seefar.com.cn/prod-api/monitor-monitoring-point/exportMonthData?month=${month}&structureType=${item.structure_type}&structureId=${item.structure_id}`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const buffer = await response.arrayBuffer();
        const fileName = `${item.structure_name}_${month}_${item.structure_id}.xlsx`;
        const filePath = path.join(EXCEL_DIR, fileName);
        fs.writeFileSync(filePath, Buffer.from(buffer));

        db.prepare('UPDATE imports SET status = ?, file_path = ?, updated_at = CURRENT_TIMESTAMP, error_msg = NULL WHERE id = ?')
            .run('success', filePath, item.id);
  } catch (err) {
      db.prepare('UPDATE imports SET status = ?, error_msg = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run('error', err.message, item.id);
      throw err;
  }
};
