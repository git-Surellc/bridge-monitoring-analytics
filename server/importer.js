import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import http from 'http';
import https from 'https';
import db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEL_DIR = path.join(__dirname, '../storage/excel');

// Ensure directory exists
if (!fs.existsSync(EXCEL_DIR)) {
  fs.mkdirSync(EXCEL_DIR, { recursive: true });
}

// In-memory task tracking
const activeTasks = new Map(); // month -> { status, progress, total, success, fail, logs: [] }

const makeGroupKey = (id, type) => `${id}-${type || '1'}`;

const truncateText = (text, maxLen = 800) => {
  if (typeof text !== 'string') return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
};

const pushLog = (task, entry) => {
  task.logs.push({ ts: Date.now(), ...entry });
};

const httpGetBuffer = (url, headers, maxRedirects = 3) =>
  new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;

      const req = lib.request(
        {
          method: 'GET',
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: `${u.pathname}${u.search}`,
          headers
        },
        (res) => {
          const statusCode = Number(res.statusCode || 0);
          const location = typeof res.headers.location === 'string' ? res.headers.location : '';

          if (
            maxRedirects > 0 &&
            [301, 302, 303, 307, 308].includes(statusCode) &&
            location
          ) {
            const nextUrl = new URL(location, u).toString();
            res.resume();
            httpGetBuffer(nextUrl, headers, maxRedirects - 1).then(resolve).catch(reject);
            return;
          }

          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            resolve({
              statusCode,
              headers: res.headers,
              buffer: Buffer.concat(chunks)
            });
          });
        }
      );

      req.on('error', reject);
      req.end();
    } catch (err) {
      reject(err);
    }
  });

const downloadExcelBuffer = async (url, headers) => {
  if (typeof globalThis.fetch === 'function') {
    const response = await fetch(url, { headers });
    const contentType = String(response.headers.get('content-type') || '');
    const contentDisposition = String(response.headers.get('content-disposition') || '');
    const statusCode = Number(response.status);
    const ab = await response.arrayBuffer();
    const buffer = Buffer.from(ab);
    return { statusCode, contentType, contentDisposition, buffer };
  }

  const res = await httpGetBuffer(url, headers);
  const contentType = String(res.headers?.['content-type'] || '');
  const contentDisposition = String(res.headers?.['content-disposition'] || '');
  return { statusCode: res.statusCode, contentType, contentDisposition, buffer: res.buffer };
};

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
      const groupKey = makeGroupKey(item.id, item.type);

      // Check DB using month + structure_id + structure_type
      const existing = db.prepare('SELECT * FROM imports WHERE month = ? AND structure_id = ? AND structure_type = ?').get(month, item.id, item.type);
      
      if (existing && existing.status === 'success' && existing.file_path && fs.existsSync(existing.file_path)) {
        // Update metadata even if skipping download (to backfill names)
        db.prepare('UPDATE imports SET structure_name = ?, structure_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(item.name, item.type, existing.id);

        const downloadUrl = `/storage/excel/${path.basename(existing.file_path)}`;

        task.success++;
        task.progress++;
        pushLog(task, { 
          id: item.id, 
          type: item.type,
          name: item.name,
          status: 'skipped', 
          msg: `完成（缓存命中）: ${item.name}`,
          fromCache: true,
          downloadUrl,
          groupKey,
          isFinal: true
        });
        continue;
      }

      // Fetch
      try {
        const url = `http://cdsd.seefar.com.cn/prod-api/monitor-monitoring-point/exportMonthData?month=${month}&structureType=${item.type}&structureId=${item.id}`;
        
        pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'info', msg: `开始获取 ${month} 数据`, groupKey });
        pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'info', msg: '请求平台 API', groupKey, detail: url });

        const headers = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Authorization': token || ''
        };

        const { statusCode, contentType, contentDisposition, buffer: buf } = await downloadExcelBuffer(url, headers);

        if (!(statusCode >= 200 && statusCode < 300)) {
          let errorDetail = '';
          try {
            const errorText = buf.toString('utf8');
            try {
              const errorJson = JSON.parse(errorText);
              errorDetail = errorJson.msg || errorJson.message || JSON.stringify(errorJson);
            } catch {
              errorDetail = errorText.slice(0, 200);
            }
          } catch {
            errorDetail = '无法读取响应内容';
          }
          throw new Error(`请求失败 (${statusCode}): ${errorDetail || 'Unknown error'}`);
        }
        
        // Check for small error response (sometimes API returns JSON error with 200 OK)
        let apiReplyDetail = '';
        if (buf.byteLength < 500) { 
           const text = buf.toString('utf8');
           try {
             const json = JSON.parse(text);
             if (json.code && json.code !== 200) {
                throw new Error(json.msg || 'API returned error JSON');
             }
             apiReplyDetail = truncateText(JSON.stringify(json));
           } catch (e) {
             // Not JSON, assume valid file content
           }
        }

        const fileName = `${item.name}_${month}_${item.id}.xlsx`;
        const filePath = path.join(EXCEL_DIR, fileName);
        fs.writeFileSync(filePath, buf);
        
        const downloadUrl = `/storage/excel/${fileName}`;

        pushLog(task, { 
          id: item.id,
          type: item.type,
          name: item.name,
          status: 'info',
          msg: `平台 API 已返回（HTTP ${statusCode}，${buf.byteLength} bytes）`,
          groupKey,
          detail: truncateText([contentType ? `Content-Type: ${contentType}` : '', contentDisposition ? `Content-Disposition: ${contentDisposition}` : '', apiReplyDetail ? `Reply: ${apiReplyDetail}` : ''].filter(Boolean).join('\n'))
        });
        pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'info', msg: `已保存 Excel：${fileName}`, groupKey });

        // Update DB
        if (existing) {
          db.prepare('UPDATE imports SET status = ?, file_path = ?, structure_name = ?, structure_type = ?, updated_at = CURRENT_TIMESTAMP, error_msg = NULL WHERE id = ?')
            .run('success', filePath, item.name, item.type, existing.id);
        } else {
          db.prepare('INSERT INTO imports (month, structure_id, structure_name, structure_type, status, file_path) VALUES (?, ?, ?, ?, ?, ?)')
            .run(month, item.id, item.name, item.type, 'success', filePath);
        }

        task.success++;
        pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'success', msg: `完成: ${item.name}`, downloadUrl, groupKey, isFinal: true });

      } catch (err) {
        task.fail++;
        pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'error', msg: `失败: ${item.name} - ${err.message}`, groupKey, isFinal: true });
        
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
      pushLog(task, { 
        id: 'system', 
        type: 'system', 
        status: 'warning', 
        msg: '用户手动停止了任务',
        groupKey: 'system',
        isFinal: true
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
        fromCache: true,
        groupKey: makeGroupKey(row.structure_id, row.structure_type),
        isFinal: true,
        ts: Date.now()
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

// Period-based import: quarter/year
const fetchMonthExcel = async (month, type, id, token) => {
  const url = `http://cdsd.seefar.com.cn/prod-api/monitor-monitoring-point/exportMonthData?month=${month}&structureType=${type}&structureId=${id}`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Authorization': token || ''
  };
  const { statusCode, contentType, contentDisposition, buffer } = await downloadExcelBuffer(url, headers);
  if (!(statusCode >= 200 && statusCode < 300)) {
    let errorDetail = '';
    try {
      const errorText = buffer.toString('utf8');
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.msg || errorJson.message || JSON.stringify(errorJson);
      } catch {
        errorDetail = errorText.slice(0, 200);
      }
    } catch {
      errorDetail = '无法读取响应内容';
    }
    throw new Error(`请求失败 (${statusCode}): ${errorDetail || 'Unknown error'}`);
  }
  if (buffer.byteLength < 500) {
    const text = buffer.toString('utf8');
    try {
      const json = JSON.parse(text);
      if (json.code && json.code !== 200) {
        throw new Error(json.msg || 'API returned error JSON');
      }
    } catch {
      // not JSON, assume valid
    }
  }
  return {
    buffer,
    meta: {
      url,
      httpStatus: statusCode,
      contentType,
      contentDisposition,
      byteLength: buffer.byteLength
    }
  };
};

const mergeMonthlyBuffersToWorkbook = (buffers) => {
  const sheetsMap = new Map(); // name -> aoa rows
  buffers.forEach((buf, idx) => {
    try {
      const wb = XLSX.read(buf, { type: 'buffer' });
      wb.SheetNames.forEach((name) => {
        const ws = wb.Sheets[name];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (!aoa || aoa.length === 0) return;
        if (!sheetsMap.has(name)) {
          sheetsMap.set(name, aoa);
        } else {
          const existing = sheetsMap.get(name);
          // Append rows excluding header
          for (let i = 1; i < aoa.length; i++) {
            existing.push(aoa[i]);
          }
        }
      });
    } catch (e) {
      // Skip malformed buffer
    }
  });
  const outWb = XLSX.utils.book_new();
  for (const [name, aoa] of sheetsMap.entries()) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(outWb, ws, name);
  }
  if (outWb.SheetNames.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([['无数据']]);
    XLSX.utils.book_append_sheet(outWb, ws, '无数据');
  }
  return outWb;
};

const resolveImportFilePath = (filePath) => {
  if (!filePath) return null;
  if (path.isAbsolute(filePath)) return filePath;
  return path.join(__dirname, '..', filePath);
};

const getCachedMonthlyExcelBuffer = (month, item) => {
  const row = db.prepare('SELECT * FROM imports WHERE month = ? AND structure_id = ? AND structure_type = ?').get(month, item.id, item.type);
  if (!row || row.status !== 'success' || !row.file_path) return null;
  const p = resolveImportFilePath(row.file_path);
  if (!p || !fs.existsSync(p)) return null;
  return fs.readFileSync(p);
};

const monthsOfQuarter = (year, quarter) => {
  const start = (quarter - 1) * 3 + 1;
  return [start, start + 1, start + 2].map((m) => `${year}-${String(m).padStart(2, '0')}`);
};

export const startQuarterImport = (year, quarter, structures, token) => {
  const key = `${year}Q${quarter}`;
  if (activeTasks.has(key)) {
    const t = activeTasks.get(key);
    if (t.status === 'running') return;
  }
  const task = {
    status: 'running',
    progress: 0,
    total: structures.length,
    success: 0,
    fail: 0,
    logs: []
  };
  activeTasks.set(key, task);
  (async () => {
    try {
      const months = monthsOfQuarter(year, quarter);
      for (const item of structures) {
        if (task.status === 'stopped') break;
        const groupKey = makeGroupKey(item.id, item.type);
        const existing = db.prepare('SELECT * FROM imports WHERE month = ? AND structure_id = ? AND structure_type = ?').get(key, item.id, item.type);
        if (existing && existing.status === 'success' && existing.file_path && fs.existsSync(existing.file_path)) {
          db.prepare('UPDATE imports SET structure_name = ?, structure_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(item.name, item.type, existing.id);
          const downloadUrl = `/storage/excel/${path.basename(existing.file_path)}`;
          task.success++;
          task.progress++;
          pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'skipped', msg: `完成（缓存命中）: ${item.name}`, fromCache: true, downloadUrl, groupKey, isFinal: true });
          continue;
        }
        try {
          pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'info', msg: `开始处理结构（${key}）`, groupKey });
          const bufs = [];
          let cacheHits = 0;
          for (const m of months) {
            const cached = getCachedMonthlyExcelBuffer(m, item);
            if (cached) {
              bufs.push(cached);
              cacheHits++;
              pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'info', msg: `缓存命中: ${m}`, groupKey });
              continue;
            }
            pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'info', msg: `开始获取: ${m}`, groupKey });
            const fetched = await fetchMonthExcel(m, item.type, item.id, token);
            bufs.push(fetched.buffer);
            pushLog(task, { 
              id: item.id,
              type: item.type,
              name: item.name,
              status: 'info',
              msg: `平台 API 已返回（${m}，HTTP ${fetched.meta.httpStatus}，${fetched.meta.byteLength} bytes）`,
              groupKey,
              detail: truncateText([fetched.meta.contentType ? `Content-Type: ${fetched.meta.contentType}` : '', fetched.meta.contentDisposition ? `Content-Disposition: ${fetched.meta.contentDisposition}` : '', fetched.meta.url ? `URL: ${fetched.meta.url}` : ''].filter(Boolean).join('\n'))
            });
          }
          const wb = mergeMonthlyBuffersToWorkbook(bufs);
          const xbuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
          const fileName = `${item.name}_${key}_${item.id}.xlsx`;
          const filePath = path.join(EXCEL_DIR, fileName);
          fs.writeFileSync(filePath, xbuf);
          const downloadUrl = `/storage/excel/${fileName}`;
          if (existing) {
            db.prepare('UPDATE imports SET status = ?, file_path = ?, structure_name = ?, structure_type = ?, updated_at = CURRENT_TIMESTAMP, error_msg = NULL WHERE id = ?')
              .run('success', filePath, item.name, item.type, existing.id);
          } else {
            db.prepare('INSERT INTO imports (month, structure_id, structure_name, structure_type, status, file_path) VALUES (?, ?, ?, ?, ?, ?)')
              .run(key, item.id, item.name, item.type, 'success', filePath);
          }
          task.success++;
          pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'success', msg: `完成: ${item.name}（合并 ${months.length} 个月，缓存命中 ${cacheHits}/${months.length}）`, downloadUrl, groupKey, isFinal: true });
        } catch (err) {
          task.fail++;
          pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'error', msg: `失败: ${item.name} - ${err.message}`, groupKey, isFinal: true });
          if (existing) {
            db.prepare('UPDATE imports SET status = ?, error_msg = ?, structure_name = ?, structure_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
              .run('error', err.message, item.name, item.type, existing.id);
          } else {
            db.prepare('INSERT INTO imports (month, structure_id, structure_name, structure_type, status, error_msg) VALUES (?, ?, ?, ?, ?, ?)')
              .run(key, item.id, item.name, item.type, 'error', err.message);
          }
        }
        task.progress++;
      }
      if (task.status !== 'stopped') task.status = 'completed';
    } catch (fatal) {
      task.status = 'failed';
      task.error = fatal.message;
    }
  })();
};

export const startYearImport = (year, structures, token) => {
  const key = `${year}`;
  if (activeTasks.has(key)) {
    const t = activeTasks.get(key);
    if (t.status === 'running') return;
  }
  const task = {
    status: 'running',
    progress: 0,
    total: structures.length,
    success: 0,
    fail: 0,
    logs: []
  };
  activeTasks.set(key, task);
  (async () => {
    try {
      const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
      for (const item of structures) {
        if (task.status === 'stopped') break;
        const groupKey = makeGroupKey(item.id, item.type);
        const existing = db.prepare('SELECT * FROM imports WHERE month = ? AND structure_id = ? AND structure_type = ?').get(key, item.id, item.type);
        if (existing && existing.status === 'success' && existing.file_path && fs.existsSync(existing.file_path)) {
          db.prepare('UPDATE imports SET structure_name = ?, structure_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(item.name, item.type, existing.id);
          const downloadUrl = `/storage/excel/${path.basename(existing.file_path)}`;
          task.success++;
          task.progress++;
          pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'skipped', msg: `完成（缓存命中）: ${item.name}`, fromCache: true, downloadUrl, groupKey, isFinal: true });
          continue;
        }
        try {
          pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'info', msg: `开始处理结构（${key}）`, groupKey });
          const bufs = [];
          let cacheHits = 0;
          for (const m of months) {
            const cached = getCachedMonthlyExcelBuffer(m, item);
            if (cached) {
              bufs.push(cached);
              cacheHits++;
              pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'info', msg: `缓存命中: ${m}`, groupKey });
              continue;
            }
            pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'info', msg: `开始获取: ${m}`, groupKey });
            const fetched = await fetchMonthExcel(m, item.type, item.id, token);
            bufs.push(fetched.buffer);
            pushLog(task, { 
              id: item.id,
              type: item.type,
              name: item.name,
              status: 'info',
              msg: `平台 API 已返回（${m}，HTTP ${fetched.meta.httpStatus}，${fetched.meta.byteLength} bytes）`,
              groupKey,
              detail: truncateText([fetched.meta.contentType ? `Content-Type: ${fetched.meta.contentType}` : '', fetched.meta.contentDisposition ? `Content-Disposition: ${fetched.meta.contentDisposition}` : '', fetched.meta.url ? `URL: ${fetched.meta.url}` : ''].filter(Boolean).join('\n'))
            });
          }
          const wb = mergeMonthlyBuffersToWorkbook(bufs);
          const xbuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
          const fileName = `${item.name}_${key}_${item.id}.xlsx`;
          const filePath = path.join(EXCEL_DIR, fileName);
          fs.writeFileSync(filePath, xbuf);
          const downloadUrl = `/storage/excel/${fileName}`;
          if (existing) {
            db.prepare('UPDATE imports SET status = ?, file_path = ?, structure_name = ?, structure_type = ?, updated_at = CURRENT_TIMESTAMP, error_msg = NULL WHERE id = ?')
              .run('success', filePath, item.name, item.type, existing.id);
          } else {
            db.prepare('INSERT INTO imports (month, structure_id, structure_name, structure_type, status, file_path) VALUES (?, ?, ?, ?, ?, ?)')
              .run(key, item.id, item.name, item.type, 'success', filePath);
          }
          task.success++;
          pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'success', msg: `完成: ${item.name}（合并 ${months.length} 个月，缓存命中 ${cacheHits}/${months.length}）`, downloadUrl, groupKey, isFinal: true });
        } catch (err) {
          task.fail++;
          pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'error', msg: `失败: ${item.name} - ${err.message}`, groupKey, isFinal: true });
          if (existing) {
            db.prepare('UPDATE imports SET status = ?, error_msg = ?, structure_name = ?, structure_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
              .run('error', err.message, item.name, item.type, existing.id);
          } else {
            db.prepare('INSERT INTO imports (month, structure_id, structure_name, structure_type, status, error_msg) VALUES (?, ?, ?, ?, ?, ?)')
              .run(key, item.id, item.name, item.type, 'error', err.message);
          }
        }
        task.progress++;
      }
      if (task.status !== 'stopped') task.status = 'completed';
    } catch (fatal) {
      task.status = 'failed';
      task.error = fatal.message;
    }
  })();
};
