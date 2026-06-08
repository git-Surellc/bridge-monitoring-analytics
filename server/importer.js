import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import http from 'http';
import https from 'https';
import db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEL_DIR = path.join(__dirname, '../storage/excel');

if (!fs.existsSync(EXCEL_DIR)) {
  fs.mkdirSync(EXCEL_DIR, { recursive: true });
}

const activeTasks = new Map();

const sanitizeFilename = (name) =>
  String(name || 'Unknown').replace(/[\/\\:*?"<>|\x00-\x1f]/g, '_').slice(0, 200);

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

const fetchMonthExcel = async (month, type, id, token) => {
  const url = `https://cdsd.seefar.com.cn/prod-api/monitor-monitoring-point/exportMonthData?month=${month}&structureType=${type}&structureId=${id}`;
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

  // Trust Content-Type over byteLength to decide if response is an error.
  if (contentType && contentType.toLowerCase().includes('application/json')) {
    const text = buffer.toString('utf8');
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`API returned JSON Content-Type but body is not valid JSON: ${text.slice(0, 200)}`);
    }
    if (json.code && json.code !== 200) {
      throw new Error(json.msg || 'API returned error JSON');
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
  const sheetsMap = new Map();
  buffers.forEach((buf) => {
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
          for (let i = 1; i < aoa.length; i++) {
            existing.push(aoa[i]);
          }
        }
      });
    } catch {
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
  const row = db.prepare(
    'SELECT * FROM imports WHERE month = ? AND structure_id = ? AND structure_type = ?'
  ).get(month, item.id, item.type);
  if (!row || row.status !== 'success' || !row.file_path) return null;
  const p = resolveImportFilePath(row.file_path);
  if (!p || !fs.existsSync(p)) return null;
  return fs.readFileSync(p);
};

const monthsOfQuarter = (year, quarter) => {
  const start = (quarter - 1) * 3 + 1;
  return [start, start + 1, start + 2].map((m) => `${year}-${String(m).padStart(2, '0')}`);
};

const upsertImport = (existing, periodKey, item, payload) => {
  const fields = { ...payload };
  if (existing) {
    db.prepare(
      'UPDATE imports SET status = ?, file_path = ?, structure_name = ?, structure_type = ?, updated_at = CURRENT_TIMESTAMP, error_msg = ? WHERE id = ?'
    ).run(fields.status, fields.filePath, item.name, item.type, fields.errorMsg || null, existing.id);
  } else {
    db.prepare(
      'INSERT INTO imports (month, structure_id, structure_name, structure_type, status, file_path, error_msg) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(periodKey, item.id, item.name, item.type, fields.status, fields.filePath || null, fields.errorMsg || null);
  }
};

const initTask = (key, total) => {
  if (activeTasks.has(key)) {
    const existing = activeTasks.get(key);
    if (existing.status === 'running') return null;
  }
  const task = {
    status: 'running',
    progress: 0,
    total,
    success: 0,
    fail: 0,
    logs: []
  };
  activeTasks.set(key, task);
  return task;
};

const processItem = async (periodKey, periods, item, token, task) => {
  const groupKey = makeGroupKey(item.id, item.type);
  const existing = db.prepare(
    'SELECT * FROM imports WHERE month = ? AND structure_id = ? AND structure_type = ?'
  ).get(periodKey, item.id, item.type);

  if (existing && existing.status === 'success' && existing.file_path && fs.existsSync(existing.file_path)) {
    db.prepare(
      'UPDATE imports SET structure_name = ?, structure_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(item.name, item.type, existing.id);
    const downloadUrl = `/storage/excel/${path.basename(existing.file_path)}`;

    task.success++;
    task.progress++;
    pushLog(task, {
      id: item.id, type: item.type, name: item.name,
      status: 'skipped', msg: `完成（缓存命中）: ${item.name}`,
      fromCache: true, downloadUrl, groupKey, isFinal: true
    });
    return;
  }

  try {
    const isSingle = periods.length === 1;
    const fileName = `${sanitizeFilename(item.name)}_${periodKey}_${item.id}.xlsx`;
    const filePath = path.join(EXCEL_DIR, fileName);
    const downloadUrl = `/storage/excel/${fileName}`;

    if (isSingle) {
      const fetched = await fetchMonthExcel(periods[0], item.type, item.id, token);
      const { buffer, meta } = fetched;
      pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'info', msg: `开始获取 ${periods[0]} 数据`, groupKey });
      pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'info', msg: '请求平台 API', groupKey, detail: meta.url });
      pushLog(task, {
        id: item.id, type: item.type, name: item.name,
        status: 'info', msg: `平台 API 已返回（HTTP ${meta.httpStatus}，${meta.byteLength} bytes）`, groupKey,
        detail: truncateText([meta.contentType ? `Content-Type: ${meta.contentType}` : '', meta.contentDisposition ? `Content-Disposition: ${meta.contentDisposition}` : ''].filter(Boolean).join('\n'))
      });
      fs.writeFileSync(filePath, buffer);
    } else {
      pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'info', msg: `开始处理结构（${periodKey}）`, groupKey });
      const bufs = [];
      let cacheHits = 0;
      for (const m of periods) {
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
          id: item.id, type: item.type, name: item.name,
          status: 'info', msg: `平台 API 已返回（${m}，HTTP ${fetched.meta.httpStatus}，${fetched.meta.byteLength} bytes）`, groupKey,
          detail: truncateText([fetched.meta.contentType ? `Content-Type: ${fetched.meta.contentType}` : '', fetched.meta.contentDisposition ? `Content-Disposition: ${fetched.meta.contentDisposition}` : '', fetched.meta.url ? `URL: ${fetched.meta.url}` : ''].filter(Boolean).join('\n'))
        });
      }
      const wb = mergeMonthlyBuffersToWorkbook(bufs);
      const xbuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      fs.writeFileSync(filePath, xbuf);
    }

    pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'info', msg: `已保存 Excel：${fileName}`, groupKey });
    upsertImport(existing, periodKey, item, { status: 'success', filePath });
    task.success++;
    const successMsg = isSingle
      ? `完成: ${item.name}`
      : `完成: ${item.name}（合并 ${periods.length} 个月，缓存命中 ${0}/${periods.length}）`;
    pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'success', msg: successMsg, downloadUrl, groupKey, isFinal: true });
  } catch (err) {
    task.fail++;
    pushLog(task, { id: item.id, type: item.type, name: item.name, status: 'error', msg: `失败: ${item.name} - ${err.message}`, groupKey, isFinal: true });
    upsertImport(existing, periodKey, item, { status: 'error', filePath: null, errorMsg: err.message });
  }

  task.progress++;
};

const runPeriodImport = async (periodKey, periods, structures, token, task) => {
  try {
    for (const item of structures) {
      if (task.status === 'stopped') break;
      await processItem(periodKey, periods, item, token, task);
    }
    if (task.status !== 'stopped') task.status = 'completed';
  } catch (fatal) {
    task.status = 'failed';
    task.error = fatal.message;
  }
};

export const startImportTask = (month, structures, token) => {
  const task = initTask(month, structures.length);
  if (!task) return;
  runPeriodImport(month, [month], structures, token, task);
};

export const startQuarterImport = (year, quarter, structures, token) => {
  const key = `${year}Q${quarter}`;
  const task = initTask(key, structures.length);
  if (!task) return;
  runPeriodImport(key, monthsOfQuarter(year, quarter), structures, token, task);
};

export const startYearImport = (year, structures, token) => {
  const key = `${year}`;
  const task = initTask(key, structures.length);
  if (!task) return;
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  runPeriodImport(key, months, structures, token, task);
};

export const stopImportTask = (month) => {
  if (activeTasks.has(month)) {
    const task = activeTasks.get(month);
    if (task.status === 'running') {
      task.status = 'stopped';
      pushLog(task, {
        id: 'system', type: 'system', status: 'warning',
        msg: '用户手动停止了任务', groupKey: 'system', isFinal: true
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

  const rows = db.prepare('SELECT * FROM imports WHERE month = ? ORDER BY structure_id ASC').all(month);
  const total = rows.length;

  if (total > 0) {
    const success = rows.filter(r => r.status === 'success').length;
    const fail = rows.filter(r => r.status === 'error').length;

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
  const item = db.prepare(
    'SELECT * FROM imports WHERE month = ? AND structure_id = ?'
  ).get(month, structureId);
  if (!item) throw new Error('Item not found');

  db.prepare('UPDATE imports SET status = ? WHERE id = ?').run('pending', item.id);

  try {
    const url = `https://cdsd.seefar.com.cn/prod-api/monitor-monitoring-point/exportMonthData?month=${month}&structureType=${item.structure_type}&structureId=${item.structure_id}`;
    const response = await fetch(url);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const buffer = await response.arrayBuffer();
    const fileName = `${sanitizeFilename(item.structure_name)}_${month}_${item.structure_id}.xlsx`;
    const filePath = path.join(EXCEL_DIR, fileName);
    fs.writeFileSync(filePath, Buffer.from(buffer));

    db.prepare(
      'UPDATE imports SET status = ?, file_path = ?, updated_at = CURRENT_TIMESTAMP, error_msg = NULL WHERE id = ?'
    ).run('success', filePath, item.id);
  } catch (err) {
    db.prepare(
      'UPDATE imports SET status = ?, error_msg = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run('error', err.message, item.id);
    throw err;
  }
};
