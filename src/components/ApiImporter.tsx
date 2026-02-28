import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { BridgeData } from '../types';
import { parseExcelArrayBuffer } from '../utils/excel';
import { Loader2, CheckCircle, AlertCircle, Play, FileInput, Bug, Download, ArrowRight } from 'lucide-react';
import { cn } from '../utils/cn';

interface ApiImporterProps {
  onImport: (data: BridgeData[]) => void;
  className?: string;
}

interface LogEntry {
  id: string;
  name?: string;
  status: 'success' | 'error' | 'info' | 'skipped';
  msg: string;
  downloadUrl?: string;
  fromCache?: boolean;
}

interface StructureItem {
  id: string;
  name: string;
  type: string; // "1" | "2" | "3"
}

export function ApiImporter({ onImport, className }: ApiImporterProps) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [structureList, setStructureList] = useState<StructureItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, fail: 0 });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // Track processed IDs to avoid re-parsing same file multiple times
  const processedIdsRef = useRef<Set<string>>(new Set());

  // Check for existing task on mount and periodically
  useEffect(() => {
    // Initial check
    checkStatus();
    
    // Poll every 3 seconds
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, [month]); 

  const checkStatus = async () => {
    try {
      const res = await fetch(`/api/import/status?month=${month}`);
      if (!res.ok) return;
      
      const data = await res.json();
      
      if (data.status === 'running' || data.status === 'completed') {
        setIsProcessing(data.status === 'running');
        setProgress({
          current: data.progress || 0,
          total: data.total || 0,
          success: data.success || 0,
          fail: data.fail || 0
        });
        
        if (data.logs && Array.isArray(data.logs)) {
          setLogs(data.logs);
          // Process any new success items that haven't been parsed yet
          processLogs(data.logs);
        }
      } else {
        setIsProcessing(false);
      }
    } catch (e) {
      // Ignore error if backend not reachable yet
    }
  };

  const processLogs = async (newLogs: LogEntry[]) => {
    for (const log of newLogs) {
      // If success and has downloadUrl, and NOT processed yet
      if ((log.status === 'success' || log.status === 'skipped') && log.downloadUrl && !processedIdsRef.current.has(log.id)) {
        try {
          // Mark as processing to avoid race conditions
          processedIdsRef.current.add(log.id);

          const fileRes = await fetch(log.downloadUrl);
          if (!fileRes.ok) throw new Error('Download failed');
          
          const blob = await fileRes.arrayBuffer();
          
          // Use name from log if available, else find in structureList, else use ID
          const name = log.name || structureList.find(s => s.id === log.id)?.name || log.id;
          
          const parsedData = await parseExcelArrayBuffer(blob, name);
          parsedData.id = log.id;
          parsedData.name = name;
          
          // Update parent
          onImport([parsedData]);
          
        } catch (e) {
          console.error(`Failed to parse ${log.id}`, e);
          // Allow retry by removing from set? 
          // Maybe not automatically. User can click retry if needed.
          processedIdsRef.current.delete(log.id);
        }
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      
      const items: StructureItem[] = [];
      // Skip header row (start from index 1)
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i] as any[];
        if (!row || row.length < 1) continue;
        
        const id = String(row[0] || '').trim();
        const name = String(row[1] || '').trim();
        const typeRaw = String(row[2] || '').trim();
        
        if (!id) continue;

        let type = '1'; // Default bridge
        if (typeRaw.includes('隧道') || typeRaw === '2') type = '2';
        else if (typeRaw.includes('边坡') || typeRaw === '3') type = '3';
        
        items.push({ id, name, type });
      }
      
      setStructureList(items);
      setLogs([{ id: 'System', status: 'info', msg: `已加载 ${items.length} 个结构物` }]);
    } catch (err: any) {
      setLogs([{ id: 'System', status: 'error', msg: `解析文件失败: ${err.message}` }]);
    }
  };

  const handleImport = async () => {
    if (structureList.length === 0) {
      alert('请先上传结构物列表 Excel');
      return;
    }

    setIsProcessing(true);
    setLogs([]);
    processedIdsRef.current.clear();
    
    try {
      const res = await fetch('/api/import/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, structures: structureList })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '启动失败');
      }
      
      // Initial check immediately
      checkStatus();
      
    } catch (e: any) {
      setIsProcessing(false);
      setLogs([{ id: 'System', status: 'error', msg: `启动失败: ${e.message}` }]);
    }
  };

  const handleRetry = async (item: StructureItem) => {
    // Optimistically update UI
    setLogs(prev => prev.map(log => 
      log.id === item.id ? { ...log, status: 'info', msg: `正在重试: ${item.name}...` } : log
    ));
    
    // Remove from processed set to allow re-parsing
    processedIdsRef.current.delete(item.id);

    try {
      await fetch('/api/import/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, structureId: item.id })
      });
      // Polling will update status
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className={cn("bg-white p-6 rounded-xl border border-gray-200 shadow-sm", className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <FileInput className="w-5 h-5 text-blue-600" />
          批量API导入 (后台任务)
        </h3>
        <button
          onClick={() => setDebugMode(!debugMode)}
          className={cn(
            "text-xs flex items-center gap-1 px-2 py-1 rounded border transition-colors",
            debugMode 
              ? "bg-amber-50 text-amber-700 border-amber-200" 
              : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
          )}
        >
          <Bug className="w-3 h-3" />
          调试模式 {debugMode ? '已开启' : '已关闭'}
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">月份</label>
          <input 
            type="month" 
            value={month} 
            onChange={e => setMonth(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">结构物列表 Excel</label>
          <div className="relative">
             <input 
              type="file" 
              accept=".xlsx, .xls"
              onChange={handleFileUpload}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm file:mr-4 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Excel 包含三列: ID, 结构名称, 类型(桥梁/隧道/边坡)
          </p>
        </div>
      </div>

      {structureList.length > 0 && (
        <div className="mb-4 bg-blue-50 p-3 rounded-lg border border-blue-100">
          <div className="flex items-center justify-between text-sm text-blue-800 mb-2">
            <span className="font-medium">已加载 {structureList.length} 个结构物</span>
          </div>
          <div className="max-h-32 overflow-y-auto text-xs space-y-1">
            {structureList.map((item, i) => (
              <div key={i} className="flex gap-2 text-blue-600">
                <span className="w-16 font-mono">{item.id}</span>
                <span className="flex-1 truncate">{item.name}</span>
                <span className="w-12 text-right">{item.type === '1' ? '桥梁' : item.type === '2' ? '隧道' : '边坡'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleImport}
        disabled={isProcessing || structureList.length === 0}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        {isProcessing ? '后台导入进行中...' : '开始批量导入'}
      </button>

      {/* Progress & Logs */}
      {(isProcessing || logs.length > 0) && (
        <div className="mt-6 border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-600">处理进度: {progress.current}/{progress.total}</span>
            <div className="flex gap-3">
              <span className="text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {progress.success} 成功</span>
              <span className="text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {progress.fail} 失败</span>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-4 overflow-hidden">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: progress.total ? `${(progress.current / progress.total) * 100}%` : '0%' }}
            />
          </div>
          
          <div className="max-h-60 overflow-y-auto space-y-2 text-xs border border-gray-100 rounded-lg p-2 bg-gray-50">
            {logs.map((log, i) => (
              <div key={i} className={cn(
                "flex items-center gap-2", 
                log.status === 'success' ? 'text-green-700' : 
                log.status === 'error' ? 'text-red-700' : 'text-gray-600'
              )}>
                {log.status === 'success' && <CheckCircle className="w-3 h-3 shrink-0" />}
                {log.status === 'error' && <AlertCircle className="w-3 h-3 shrink-0" />}
                {log.status === 'info' && <div className="w-3 h-3 shrink-0" />}
                {log.status === 'skipped' && <div className="w-3 h-3 shrink-0 text-gray-400">⚡</div>}
                
                <span className="font-mono shrink-0">{log.id}:</span>
                <span className="break-all mr-2">{log.msg}</span>
                
                <div className="ml-auto flex items-center gap-2 shrink-0">
                  {log.status === 'error' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Need item details for retry. Use log details or find in structureList
                        const item = structureList.find(s => s.id === log.id);
                        if (item) handleRetry(item);
                      }}
                      className="text-blue-600 hover:text-blue-800 hover:underline px-2 py-0.5 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      重试
                    </button>
                  )}
                  {log.downloadUrl && (
                    <a 
                      href={log.downloadUrl}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-600 hover:text-green-800 hover:underline px-2 py-0.5"
                    >
                      <Download className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
