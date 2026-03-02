import React, { useState, useEffect } from 'react';
import { Trash2, FileText, Calendar, RefreshCw, AlertCircle, CheckCircle, Download, XCircle, Search } from 'lucide-react';
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
  const [clearing, setClearing] = useState(false);

  // Filters
  const [filterMonth, setFilterMonth] = useState('');
  const [filterName, setFilterName] = useState('');

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

  const handleClearDatabase = async () => {
    if (!confirm('⚠️ 警告：这将清空整个数据库并删除所有已下载的 Excel 文件！\n此操作不可恢复！\n\n确定要继续吗？')) return;
    
    setClearing(true);
    try {
      const res = await fetch('/api/admin/clear-database', { method: 'DELETE' });
      if (!res.ok) throw new Error('Clear failed');
      
      alert('数据库已清空');
      fetchFiles();
    } catch (err) {
      alert('操作失败: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setClearing(false);
    }
  };

  const handleFixFilenames = async () => {
    if (!confirm('确定要批量重命名所有现有文件吗？这将把文件名改为 "结构名称_月份_ID.xlsx" 格式。')) return;
    
    setFixing(true);
    setFixResult(null);
    try {
      const res = await fetch('/api/admin/fix-filenames', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed');
      }
      const data = await res.json();
      
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

  const getDownloadUrl = (file: ImportedFile) => {
    // Assuming backend serves storage/excel at /storage/excel/
    // We need to extract just the filename from the full path
    const filename = file.file_path.split(/[/\\]/).pop();
    return `/storage/excel/${filename}`;
  };

  // Filter logic
  const filteredFiles = files.filter(file => {
    const matchMonth = filterMonth ? file.month.includes(filterMonth) : true;
    const matchName = filterName ? (file.structure_name?.toLowerCase().includes(filterName.toLowerCase()) || file.structure_id.includes(filterName)) : true;
    return matchMonth && matchName;
  });

  if (loading) return <div className="p-8 text-center text-gray-500">加载中...</div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          数据库文件管理
        </h2>
        <div className="flex gap-2 items-center">
           <div className="flex items-center gap-2 mr-4 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">
             <Calendar className="w-4 h-4 text-gray-400" />
             <input 
               type="month" 
               value={filterMonth}
               onChange={(e) => setFilterMonth(e.target.value)}
               className="text-sm border-none focus:ring-0 p-0 text-gray-600 w-32"
               placeholder="筛选月份"
             />
             <div className="w-px h-4 bg-gray-200 mx-2"></div>
             <Search className="w-4 h-4 text-gray-400" />
             <input 
               type="text" 
               value={filterName}
               onChange={(e) => setFilterName(e.target.value)}
               className="text-sm border-none focus:ring-0 p-0 text-gray-600 w-32"
               placeholder="结构名称/ID"
             />
             {(filterMonth || filterName) && (
               <button 
                 onClick={() => { setFilterMonth(''); setFilterName(''); }}
                 className="ml-2 text-gray-400 hover:text-gray-600"
               >
                 <XCircle className="w-4 h-4" />
               </button>
             )}
           </div>

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
            title="批量修复文件名格式"
          >
             {fixing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
             重命名
          </button>

          <button
            onClick={handleClearDatabase}
            disabled={clearing}
            className="px-3 py-1.5 text-sm bg-red-50 text-red-700 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-2 border border-red-200"
            title="清空所有数据"
          >
             {clearing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
             清空库
          </button>
        </div>
      </div>

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 font-medium">ID</th>
              <th className="px-6 py-3 font-medium">月份</th>
              <th className="px-6 py-3 font-medium">结构名称 (ID)</th>
              <th className="px-6 py-3 font-medium">类型</th>
              <th className="px-6 py-3 font-medium">状态</th>
              <th className="px-6 py-3 font-medium">文件路径 / 错误信息</th>
              <th className="px-6 py-3 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredFiles.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  没有找到相关文件
                </td>
              </tr>
            ) : (
              filteredFiles.map((file) => (
                <tr key={file.id} className="bg-white border-b hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-gray-500 font-mono">#{file.id}</td>
                  <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                    {file.month}
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    <div className="font-medium">{file.structure_name || '-'}</div>
                    <div className="text-xs text-gray-400">{file.structure_id}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {file.structure_type === '1' ? '桥梁' : file.structure_type === '2' ? '隧道' : '边坡'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2.5 py-0.5 rounded-full text-xs font-medium border",
                      file.status === 'success' ? "bg-green-50 text-green-700 border-green-200" :
                      file.status === 'error' ? "bg-red-50 text-red-700 border-red-200" :
                      "bg-yellow-50 text-yellow-700 border-yellow-200"
                    )}>
                      {file.status === 'success' ? '成功' : file.status === 'error' ? '失败' : '处理中'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500 max-w-xs truncate" title={file.file_path || file.error_msg}>
                    {file.status === 'error' ? (
                      <span className="text-red-600 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {file.error_msg}
                      </span>
                    ) : (
                      file.file_path ? file.file_path.split(/[/\\]/).pop() : '-'
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    {file.status === 'success' && (
                      <a 
                        href={getDownloadUrl(file)}
                        download
                        className="text-blue-600 hover:text-blue-900 inline-flex items-center gap-1"
                        title="下载文件"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                    <button
                      onClick={() => handleDelete(file.id)}
                      className="text-red-600 hover:text-red-900 inline-flex items-center gap-1"
                      title="删除记录"
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
      
      <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 flex justify-between">
         <span>共 {files.length} 个文件</span>
         <span>最后更新: {new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  );
}
