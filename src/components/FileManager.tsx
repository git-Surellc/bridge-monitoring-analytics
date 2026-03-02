import React, { useState, useEffect } from 'react';
import { Trash2, FileText, Calendar, RefreshCw, AlertCircle, CheckCircle, Download, XCircle, Search, Loader2, FileType } from 'lucide-react';
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

interface ReportTask {
  id: number;
  task_id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  file_path: string;
  error_msg?: string;
  created_at: string;
  updated_at: string;
}

export function FileManager() {
  const [activeTab, setActiveTab] = useState<'excel' | 'word'>('excel');
  
  // Excel Files State
  const [files, setFiles] = useState<ImportedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  // Word Reports State
  const [reports, setReports] = useState<ReportTask[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

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

  const fetchReports = async () => {
    setReportsLoading(true);
    try {
      const res = await fetch('/api/reports');
      if (!res.ok) throw new Error('Failed to fetch reports');
      const data = await res.json();
      setReports(data);
    } catch (err) {
      console.error(err);
    } finally {
      setReportsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'excel') {
      fetchFiles();
    } else {
      fetchReports();
    }
  }, [activeTab]);

  // Polling for active reports
  useEffect(() => {
    if (activeTab !== 'word') return;

    const hasActiveReports = reports.some(r => r.status === 'pending' || r.status === 'processing');
    if (!hasActiveReports) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/reports');
        if (res.ok) {
          const data = await res.json();
          setReports(data);
        }
      } catch (err) {
        console.error(err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeTab, reports]);

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

  const handleDeleteReport = async (id: number) => {
    if (!confirm('确定要删除这个报告吗？此操作不可恢复。')) return;

    try {
      const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      
      setReports(reports.filter(r => r.id !== id));
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

  const getReportDownloadUrl = (report: ReportTask) => {
    const filename = report.file_path.split(/[/\\]/).pop();
    return `/api/reports/download/${filename}`;
  };

  const getDownloadUrl = (file: ImportedFile) => {
    // If file_path is absolute/relative path from server, we need to extract filename
    // Assuming file_path stores something like 'storage/excel/filename.xlsx' or full path
    const filename = file.file_path.split(/[/\\]/).pop();
    return `/api/files/download/${filename}`;
  };

  // Filter logic
  const filteredFiles = files.filter(file => {
    const matchMonth = filterMonth ? file.month.includes(filterMonth) : true;
    const matchName = filterName ? (file.structure_name?.toLowerCase().includes(filterName.toLowerCase()) || file.structure_id.includes(filterName)) : true;
    return matchMonth && matchName;
  });

  if (loading && activeTab === 'excel') return <div className="p-8 text-center text-gray-500">加载中...</div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 flex flex-col gap-4 bg-gray-50 shrink-0">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            文件管理中心
          </h2>
          
          <div className="flex bg-gray-200 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('excel')}
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                activeTab === 'excel' 
                  ? "bg-white text-blue-600 shadow-sm" 
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              Excel 数据
            </button>
            <button
              onClick={() => setActiveTab('word')}
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                activeTab === 'word' 
                  ? "bg-white text-blue-600 shadow-sm" 
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              Word 报告
            </button>
          </div>
        </div>

        {activeTab === 'excel' ? (
          <div className="flex gap-2 items-center justify-between">
             <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">
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
        ) : (
          <div className="flex gap-2 items-center justify-end">
             <button 
              onClick={fetchReports}
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="刷新列表"
            >
              <RefreshCw className={cn("w-5 h-5", reportsLoading && "animate-spin")} />
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto flex-1">
        {activeTab === 'excel' ? (
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
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 font-medium">ID</th>
                <th className="px-6 py-3 font-medium">报告名称</th>
                <th className="px-6 py-3 font-medium">生成时间</th>
                <th className="px-6 py-3 font-medium">状态 / 进度</th>
                <th className="px-6 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    暂无生成的报告
                  </td>
                </tr>
              ) : (
                reports.map((report) => (
                  <tr key={report.id} className="bg-white border-b hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-500 font-mono">#{report.id}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <FileType className="w-4 h-4 text-blue-500" />
                        {report.name}
                      </div>
                      <div className="text-xs text-gray-400 mt-1 font-mono">{report.task_id.slice(0, 8)}</div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {new Date(report.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 max-w-[200px]">
                        <div className="flex justify-between items-center text-xs">
                          <span className={cn(
                            "font-medium",
                            report.status === 'completed' ? "text-green-600" :
                            report.status === 'failed' ? "text-red-600" :
                            "text-blue-600"
                          )}>
                            {report.status === 'completed' ? '生成成功' : 
                             report.status === 'failed' ? '生成失败' : 
                             '正在生成...'}
                          </span>
                          <span className="text-gray-500">{report.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              report.status === 'completed' ? "bg-green-500" :
                              report.status === 'failed' ? "bg-red-500" :
                              "bg-blue-500"
                            )}
                            style={{ width: `${report.progress}%` }}
                          ></div>
                        </div>
                        {report.error_msg && (
                          <div className="text-xs text-red-500 mt-1 truncate" title={report.error_msg}>
                            {report.error_msg}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {report.status === 'completed' && (
                        <a 
                          href={getReportDownloadUrl(report)}
                          download
                          className="text-blue-600 hover:text-blue-900 inline-flex items-center gap-1"
                          title="下载报告"
                        >
                          <Download className="w-4 h-4" />
                          下载
                        </a>
                      )}
                      <button
                        onClick={() => handleDeleteReport(report.id)}
                        className="text-red-600 hover:text-red-900 inline-flex items-center gap-1 ml-2"
                        title="删除报告"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
      
      <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 flex justify-between">
         <span>共 {activeTab === 'excel' ? files.length : reports.length} 个{activeTab === 'excel' ? '文件' : '报告'}</span>
         <span>最后更新: {new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  );
}
