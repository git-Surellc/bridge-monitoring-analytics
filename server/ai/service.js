import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';

// Limit concurrent AI requests to avoid rate limits
const CONCURRENT_LIMIT = 1;

/**
 * Start a batch analysis task
 * @param {Array<{id: string, name: string, prompt: string}>} tasks - List of tasks
 * @param {Object} config - AI Configuration (baseUrl, apiKey, model)
 * @returns {string} batchId
 */
export const startBatchAnalysis = (tasks, config) => {
  const batchId = uuidv4();
  
  const stmt = db.prepare(`
    INSERT INTO ai_tasks (batch_id, structure_id, structure_name, prompt, status)
    VALUES (?, ?, ?, ?, 'pending')
  `);

  const insert = db.transaction((taskList) => {
    for (const task of taskList) {
      stmt.run(batchId, task.id, task.name, task.prompt);
    }
  });

  insert(tasks);
  
  // Start processing in background (fire and forget)
  processBatch(batchId, config).catch(console.error);

  return batchId;
};

/**
 * Get status of a batch analysis
 * @param {string} batchId 
 * @returns {Object} status
 */
export const getBatchStatus = (batchId) => {
  const tasksRaw = db.prepare(`
    SELECT structure_id, structure_name, status, result, error 
    FROM ai_tasks 
    WHERE batch_id = ?
  `).all(batchId);

  if (tasksRaw.length === 0) {
    return null;
  }

  const total = tasksRaw.length;
  const completed = tasksRaw.filter(t => t.status === 'completed').length;
  const failed = tasksRaw.filter(t => t.status === 'failed').length;
  const cancelled = tasksRaw.filter(t => t.status === 'cancelled').length;
  const processing = tasksRaw.filter(t => t.status === 'processing').length;
  const pendingOnly = tasksRaw.filter(t => t.status === 'pending').length;
  const pending = pendingOnly + processing;
  const isComplete = pending === 0;

  // Calculate progress percentage
  const progress = total > 0 ? Math.round(((completed + failed + cancelled) / total) * 100) : 0;

  return {
    batchId,
    total,
    completed,
    failed,
    cancelled,
    processing,
    pending,
    progress,
    isComplete,
    tasks: tasksRaw.map(t => ({
      id: t.structure_id,
      name: t.structure_name,
      status: t.status,
      result: t.result,
      error: t.error
    }))
  };
};

/**
 * Stop a batch analysis by cancelling all pending tasks
 * @param {string} batchId 
 * @returns {{cancelled: number}}
 */
export const stopBatchAnalysis = (batchId) => {
  const stmt = db.prepare(`
    UPDATE ai_tasks 
    SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
    WHERE batch_id = ? AND status = 'pending'
  `);
  const result = stmt.run(batchId);
  return { cancelled: result.changes || 0 };
};

/**
 * Process a batch of tasks
 * @param {string} batchId 
 * @param {Object} config 
 */
const processBatch = async (batchId, config) => {
  console.log(`[AI Batch] Starting batch ${batchId}`);
  
  while (true) {
    const next = db.prepare(`
      SELECT id, structure_id, structure_name, prompt 
      FROM ai_tasks 
      WHERE batch_id = ? AND status = 'pending'
      ORDER BY id ASC
      LIMIT 1
    `).get(batchId);
    if (!next) break;
    await processTask(next, config);
  }
  
  console.log(`[AI Batch] Batch ${batchId} completed`);
};

/**
 * Process a single task
 * @param {Object} task 
 * @param {Object} config 
 */
const processTask = async (task, config) => {
  // Update status to processing
  db.prepare('UPDATE ai_tasks SET status = ? WHERE id = ?').run('processing', task.id);

  try {
    const result = await callAiProvider(task.prompt, config);
    db.prepare('UPDATE ai_tasks SET status = ?, result = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('completed', result, task.id);
  } catch (error) {
    console.error(`[AI Batch] Task failed for ${task.structure_name}:`, error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    db.prepare('UPDATE ai_tasks SET status = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('failed', errorMsg, task.id);
  }
};

/**
 * Call AI Provider API
 * @param {string} prompt 
 * @param {Object} config 
 */
const DEFAULT_TIMEOUT_MS = 60000;

const callAiProvider = async (prompt, config) => {
  let { baseUrl, apiKey, model } = config;
  
  if (!baseUrl || !apiKey) throw new Error('Missing AI config');

  baseUrl = baseUrl.trim();
  apiKey = apiKey.trim();
  model = (model || '').trim();

  // URL normalization: handle Aliyun DashScope (compatible) and Bailian OpenAI endpoints
  let url = baseUrl.replace(/\/$/, '');
  const isDashScope = /dashscope\.aliyuncs\.com/i.test(url);
  const isCodingPlan = /coding\.dashscope\.aliyuncs\.com/i.test(url);
  const isBailianOpenAI = /bailian[-.]openai|aliyun.*openai|bailian-openai/i.test(url);
  
  if (url.endsWith('/chat/completions')) {
    // Already full endpoint
  } else if (isCodingPlan) {
    if (url.endsWith('/v1')) {
      url += '/chat/completions';
    } else if (!/\/v1\/chat\/completions$/i.test(url)) {
      url += '/v1/chat/completions';
    }
  } else if (isDashScope) {
    if (/\/compatible\/v1$/i.test(url)) {
      url += '/chat/completions';
    } else if (!/\/compatible\/v1\/chat\/completions$/i.test(url)) {
      url += '/compatible/v1/chat/completions';
    }
  } else if (isBailianOpenAI) {
    if (url.endsWith('/v1')) {
      url += '/chat/completions';
    } else if (!/\/v1\/chat\/completions$/i.test(url)) {
      url += '/v1/chat/completions';
    }
  } else {
    // Generic OpenAI-compatible
    if (url.endsWith('/v1')) {
      url += '/chat/completions';
    } else if (!/\/v1\/chat\/completions$/i.test(url)) {
      url += '/v1/chat/completions';
    }
  }

  console.log(`[AI Batch] Calling AI: ${url}, Model: ${model}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'qwen-turbo',
        messages: [
          { role: 'system', content: '你是一个专业的结构健康监测数据分析助手。' },
          { role: 'user', content: prompt }
        ],
        stream: false
      }),
      signal: controller.signal
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error('AI 请求超时(30s)');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errText = await response.text();
    // Try to parse JSON error
    try {
      const errJson = JSON.parse(errText);
      throw new Error(JSON.stringify(errJson));
    } catch (e) {
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error('No content in AI response');
  }
  
  return content;
};
