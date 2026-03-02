/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { UploadArea } from './components/UploadArea';
import { ApiImporter } from './components/ApiImporter';
import { Dashboard } from './components/Dashboard';
import { FileManager } from './components/FileManager';
import { BridgeData } from './types';
import { parseExcelFile } from './utils/excel';
import { LayoutDashboard, Loader2, FileUp, Globe, Database, LineChart } from 'lucide-react';
import { cn } from './utils/cn';

import { APP_VERSION, BUILD_DATE, BUILD_NUMBER } from './version';

export default function App() {
  const [bridges, setBridges] = useState<BridgeData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'file' | 'api'>('file');
  
  const [currentView, setCurrentView] = useState<'upload' | 'dashboard' | 'files'>('upload');
  const [importLogs, setImportLogs] = useState<any[]>([]);

  const handleUpload = async (files: File[]) => {
    setIsLoading(true);
    setError(null);
    try {
      const newBridges: BridgeData[] = [];
      for (const file of files) {
        const bridgeData = await parseExcelFile(file);
        newBridges.push(bridgeData);
      }
      setBridges((prev) => {
        const existingIds = new Set(prev.map(b => b.id));
        const uniqueNew = newBridges.filter(b => !existingIds.has(b.id));
        return [...prev, ...uniqueNew];
      });
      setCurrentView('dashboard');
    } catch (err) {
      console.error(err);
      setError('解析文件失败，请确保上传的是有效的 Excel 文件。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setBridges([]);
    setError(null);
    setCurrentView('upload');
  };

  const handleApiImport = (newBridges: BridgeData[]) => {
    setBridges((prev) => {
      const existingIds = new Set(prev.map(b => b.id));
      const uniqueNew = newBridges.filter(b => !existingIds.has(b.id));
      return [...prev, ...uniqueNew];
    });
    // Don't switch immediately if we want to show progress, 
    // but the current logic in ApiImporter handles the flow.
    // We will let the user choose when to go to dashboard or it happens automatically.
    // For now, keep existing behavior but we might want to change it 
    // if we want to show the import logs in the dashboard.
    setCurrentView('dashboard');
  };

  const handleImportLogs = (logs: any[]) => {
    setImportLogs(logs);
  };

  const handleBack = () => {
    setCurrentView('upload');
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <LayoutDashboard className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              结构监测<span className="text-blue-600">数据分析系统</span>
            </h1>
          </div>
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setCurrentView('upload')}
              className={cn(
                "flex items-center gap-2 text-sm font-medium transition-colors",
                currentView === 'upload' ? "text-blue-600" : "text-gray-600 hover:text-gray-900"
              )}
            >
              <FileUp className="w-4 h-4" />
              数据导入
            </button>

            {bridges.length > 0 && (
              <button 
                onClick={() => setCurrentView('dashboard')}
                className={cn(
                  "flex items-center gap-2 text-sm font-medium transition-colors",
                  currentView === 'dashboard' ? "text-blue-600" : "text-gray-600 hover:text-gray-900"
                )}
              >
                <LineChart className="w-4 h-4" />
                分析报表
              </button>
            )}

            <button 
              onClick={() => setCurrentView('files')}
              className={cn(
                "flex items-center gap-2 text-sm font-medium transition-colors",
                currentView === 'files' ? "text-blue-600" : "text-gray-600 hover:text-gray-900"
              )}
            >
              <Database className="w-4 h-4" />
              文件管理
            </button>
            <div className="text-sm text-gray-500 font-mono">
              v{APP_VERSION} ({BUILD_DATE} {BUILD_NUMBER})
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <span className="font-medium">错误:</span> {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-[60vh]">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
            <p className="text-gray-500 font-medium">正在处理数据文件...</p>
          </div>
        ) : (
          <>
            {currentView === 'upload' && (
              <div className="max-w-2xl mx-auto mt-20">
                <div className="text-center mb-10">
                  <h2 className="text-3xl font-bold text-gray-900 mb-4">
                    开始您的分析
                  </h2>
                  <p className="text-lg text-gray-600">
                    上传桥梁传感器数据（Excel），即刻生成时程曲线可视化报告，支持导出 Word 和 PDF。
                  </p>
                </div>

                <div className="flex justify-center mb-8">
                  <div className="bg-white p-1.5 rounded-xl border border-gray-200 shadow-sm inline-flex gap-1">
                    <button 
                      onClick={() => setImportMode('file')}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200", 
                        importMode === 'file' 
                          ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100" 
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      )}
                    >
                      <FileUp className="w-4 h-4" />
                      文件上传
                    </button>
                    <button 
                      onClick={() => setImportMode('api')}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200", 
                        importMode === 'api' 
                          ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100" 
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      )}
                    >
                      <Globe className="w-4 h-4" />
                      API 批量导入
                    </button>
                  </div>
                </div>

                {importMode === 'file' ? (
                  <UploadArea onUpload={handleUpload} />
                ) : (
                  <ApiImporter onImport={handleApiImport} onLogUpdate={handleImportLogs} />
                )}
                
                <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                  <div className="p-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-600 font-bold">1</div>
                    <h3 className="font-medium text-gray-900">数据接入</h3>
                    <p className="text-sm text-gray-500 mt-1">支持 Excel 文件上传或通过 API 自动同步数据</p>
                  </div>
                  <div className="p-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-600 font-bold">2</div>
                    <h3 className="font-medium text-gray-900">数据管理</h3>
                    <p className="text-sm text-gray-500 mt-1">在线管理数据库文件，支持批量重命名与清洗</p>
                  </div>
                  <div className="p-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-600 font-bold">3</div>
                    <h3 className="font-medium text-gray-900">分析报告</h3>
                    <p className="text-sm text-gray-500 mt-1">自动生成可视化图表，一键导出 Word/PDF 报告</p>
                  </div>
                </div>
              </div>
            )}

            {currentView === 'dashboard' && (
              <Dashboard 
                bridges={bridges} 
                importLogs={importLogs}
                onClear={handleClear} 
                onBack={handleBack} 
              />
            )}

            {currentView === 'files' && (
              <div className="max-w-6xl mx-auto">
                <div className="mb-6">
                  <button 
                    onClick={() => setCurrentView('upload')} 
                    className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors"
                  >
                    ← 返回首页
                  </button>
                </div>
                <FileManager />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
