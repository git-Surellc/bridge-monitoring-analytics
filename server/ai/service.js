import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';

// Limit concurrent AI requests to avoid rate limits
const CONCURRENT_LIMIT = 3;

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
  const tasks = db.prepare(`
    SELECT structure_id, structure_name, status, result, error 
    FROM ai_tasks 
    WHERE batch_id = ?
  `).all();

  if (tasks.length === 0) {
    return null;
  }

  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const failed = tasks.filter(t => t.status === 'failed').length;
  const pending = total - completed - failed;
  const isComplete = pending === 0;

  // Calculate progress percentage
  const progress = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0;

  return {
    batchId,
    total,
    completed,
    failed,
    pending,
    progress,
    isComplete,
    tasks: tasks.map(t => ({
      id: t.structure_id,
      name: t.structure_name,
      status: t.status,
      result: t.result,
      error: t.error
    }))
  };
};

/**
 * Process a batch of tasks
 * @param {string} batchId 
 * @param {Object} config 
 */
const processBatch = async (batchId, config) => {
  console.log(`[AI Batch] Starting batch ${batchId}`);
  
  // Get all pending tasks for this batch
  // We process them in chunks
  let hasPending = true;

  while (hasPending) {
    // Fetch next chunk of pending tasks
    const tasks = db.prepare(`
      SELECT id, structure_id, structure_name, prompt 
      FROM ai_tasks 
      WHERE batch_id = ? AND status = 'pending'
      LIMIT ?
    `).all(batchId, CONCURRENT_LIMIT);

    if (tasks.length === 0) {
      hasPending = false;
      break;
    }

    console.log(`[AI Batch] Processing chunk of ${tasks.length} tasks for batch ${batchId}`);

    // Process chunk in parallel
    await Promise.all(tasks.map(task => processTask(task, config)));
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
  db.prepare('UPDATE ai_tasks SET status = "processing" WHERE id = ?').run(task.id);

  try {
    const result = await callAiProvider(task.prompt, config);
    db.prepare('UPDATE ai_tasks SET status = "completed", result = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(result, task.id);
  } catch (error) {
    console.error(`[AI Batch] Task failed for ${task.structure_name}:`, error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    db.prepare('UPDATE ai_tasks SET status = "failed", error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(errorMsg, task.id);
  }
};

/**
 * Call AI Provider API
 * @param {string} prompt 
 * @param {Object} config 
 */
const callAiProvider = async (prompt, config) => {
  let { baseUrl, apiKey, model } = config;
  
  if (!baseUrl || !apiKey) throw new Error('Missing AI config');

  baseUrl = baseUrl.trim();
  apiKey = apiKey.trim();
  model = (model || '').trim();

  // URL normalization logic similar to /api/ai/chat
  let url = baseUrl.replace(/\/$/, '');
  
  // If user provided full path to chat/completions, use it
  if (url.endsWith('/chat/completions')) {
     // do nothing
  } else if (url.endsWith('/v1')) {
     url += '/chat/completions';
  } else {
     // Assume base url, append v1/chat/completions
     // However, some providers might not use v1. 
     // Standard OpenAI compatible is /v1/chat/completions
     url += '/v1/chat/completions';
  }

  console.log(`[AI Batch] Calling AI: ${url}, Model: ${model}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: '你是一个专业的结构健康监测数据分析助手。' },
        { role: 'user', content: prompt }
      ],
      stream: false
    })
  });

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
