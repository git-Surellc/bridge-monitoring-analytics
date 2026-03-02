import React, { useState, useEffect } from 'react';
import { Trash2, FileText, Calendar, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../utils/cn';

interface ImportedFile {
  id: number;
  month: string;
  structure_id: string;
  structure_name: string;
  structure_type: string;
  status: string;
  file_path: string;
  error_msg?: string;
  created_at: string;
  updated_at: string;
}

export function FileManager() {
  const [files, setFiles] = useState<ImportedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<string | null>(null);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/files');
      if (!res.ok) throw new Error('Failed to fetch files');
      const data = await res.json();
      setFiles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个文件吗？此操作不可恢复。')) return;

    try {
      const res = await fetch(`/api/files/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      
      // Optimistic update
      setFiles(files.filter(f => f.id !== id));
    } catch (err) {
      alert('删除失败: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleFixFilenames = async () => {
    if (!confirm('确定要批量重命名所有现有文件吗？这将把文件名改为 "结构名称_月份_ID.xlsx" 格式。')) return;
    
    setFixing(true);
    setFixResult(null);
    try {
      const res = await fetch('/api/admin/fix-filenames', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      
      setFixResult(data.message);
      if (data.errors) {
        alert('部分文件重命名失败:\n' + data.errors.join('\n'));
      }
      fetchFiles(); // Refresh list
    } catch (err) {
      alert('操作失败: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setFixing(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">加载中...</div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          数据库文件管理
        </h2>
        <div className="flex gap-2">
           <button 
            onClick={fetchFiles}
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="刷新列表"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={handleFixFilenames}
            disabled={fixing}
            className="px-3 py-1.5 text-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg transition-colors flex items-center gap-2 border border-indigo-200"
            title="批量修复现有文件的命名格式"
          >
            {fixing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            批量重命名旧文件
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 border-b border-red-200 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {fixResult && (
        <div className="p-4 bg-green-50 text-green-700 border-b border-green-200 flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          {fixResult}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-6 py-3 font-medium">结构名称 (ID)</th>
              <th className="px-6 py-3 font-medium">月份</th>
              <th className="px-6 py-3 font-medium">状态</th>
              <th className="px-6 py-3 font-medium">文件名</th>
              <th className="px-6 py-3 font-medium">下载时间</th>
              <th className="px-6 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {files.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                  暂无数据文件
                </td>
              </tr>
            ) : (
              files.map((file) => (
                <tr key={file.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    <div>{file.structure_name || 'Unknown'}</div>
                    <div className="text-xs text-gray-400 font-mono">{file.structure_id}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      {file.month}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-xs font-medium",
                      file.status === 'success' ? "bg-green-100 text-green-700" : 
                      file.status === 'error' ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                    )}>
                      {file.status === 'success' ? '已完成' : file.status === 'error' ? '失败' : '处理中'}
                    </span>
                    {file.status === 'error' && (
                      <div className="text-xs text-red-500 mt-1 max-w-[200px] truncate" title={file.error_msg}>
                        {file.error_msg}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-500 max-w-[250px] truncate font-mono text-xs" title={file.file_path}>
                    {file.file_path ? file.file_path.split(/[/\\]/).pop() : '-'}
                  </td>
                  <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                    {format(new Date(file.created_at), 'yyyy-MM-dd HH:mm')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDelete(file.id)}
                      className="text-red-600 hover:text-red-800 p-1.5 hover:bg-red-50 rounded transition-colors"
                      title="删除文件"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
