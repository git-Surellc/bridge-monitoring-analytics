/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { UploadArea } from './components/UploadArea';
import { ApiImporter } from './components/ApiImporter';
import { Dashboard } from './components/Dashboard';
import { FileManager } from './components/FileManager';
import { StructureData } from './types';
import { parseExcelFile } from './utils/excel';
import { LayoutDashboard, Loader2, FileUp, Globe, Database, LineChart, BookOpen, CheckSquare, BarChart3, FileText, Bot } from 'lucide-react';
import { cn } from './utils/cn';

import { AiConfig } from './components/AiConfig';
import { Login } from './components/Login';
import { APP_VERSION, BUILD_DATE, BUILD_NUMBER } from './version';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const token = localStorage.getItem('auth_token');
    const expiry = localStorage.getItem('auth_expiry');
    
    if (!token) return false;
    
    // Check if expired (24 hours)
    if (expiry && Date.now() > parseInt(expiry, 10)) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_expiry');
      return false;
    }
    
    return true;
  });

  const [structures, setStructures] = useState<StructureData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'file' | 'api'>('file');
  
  const [currentView, setCurrentView] = useState<'upload' | 'dashboard' | 'files' | 'ai-config'>('upload');
  const [importLogs, setImportLogs] = useState<any[]>([]);
  const [customOrder, setCustomOrder] = useState(() => localStorage.getItem('api_import_order') || '');
  const [customGroups, setCustomGroups] = useState(() => localStorage.getItem('api_import_groups') || '');

  useEffect(() => {
    localStorage.setItem('api_import_order', customOrder);
  }, [customOrder]);

  useEffect(() => {
    localStorage.setItem('api_import_groups', customGroups);
  }, [customGroups]);

  const handleUpload = async (files: File[]) => {
    setIsLoading(true);
    setError(null);
    try {
      const newStructures: StructureData[] = [];
      for (const file of files) {
        const structureData = await parseExcelFile(file);
        newStructures.push(structureData);
      }
      setStructures((prev) => {
        const existingKeys = new Set(prev.map(b => `${b.id}-${b.type || '1'}`));
        const uniqueNew = newStructures.filter(b => !existingKeys.has(`${b.id}-${b.type || '1'}`));
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
    setStructures([]);
    setError(null);
    setCurrentView('upload');
  };

  const handleApiImport = (newStructures: StructureData[]) => {
    setStructures((prev) => {
      // Create a map for faster lookup and update
      const structureMap = new Map(prev.map(s => [`${s.id}-${s.type || '1'}`, s]));
      
      // Update or add new structures
      newStructures.forEach(newS => {
         const key = `${newS.id}-${newS.type || '1'}`;
         // Overwrite existing structure to ensure name and data are updated
         structureMap.set(key, newS);
      });
      
      return Array.from(structureMap.values());
    });
    // Don't switch immediately if we want to show progress, 
    // but the current logic in ApiImporter handles the flow.
    setCurrentView('dashboard');
  };

  const handleImportLogs = (logs: any[]) => {
    setImportLogs(logs);
  };

  const handleBack = () => {
    setCurrentView('upload');
  };

  const handleLogin = (token: string) => {
    localStorage.setItem('auth_token', token);
    // Set expiry to 24 hours from now
    localStorage.setItem('auth_expiry', (Date.now() + 24 * 60 * 60 * 1000).toString());
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

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

            {structures.length > 0 && (
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

            <button 
              onClick={() => setCurrentView('ai-config')}
              className={cn(
                "flex items-center gap-2 text-sm font-medium transition-colors",
                currentView === 'ai-config' ? "text-blue-600" : "text-gray-600 hover:text-gray-900"
              )}
            >
              <Bot className="w-4 h-4" />
              AI配置
            </button>
            <div className="flex flex-col items-end">
              <div className="text-sm text-gray-500 font-mono">
                v{APP_VERSION} ({BUILD_DATE} v{BUILD_NUMBER})
              </div>
              <div className="mt-0.5 px-2 py-0.5 bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[10px] italic rounded transform -skew-x-12 shadow-sm font-semibold tracking-wide">
                By Surellc
              </div>
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
              <div className="max-w-7xl mx-auto mt-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Left Column: Usage Guide */}
                <div className="lg:col-span-4 order-2 lg:order-1">
                  <div className="sticky top-24">
                    <div className="flex items-center gap-2 mb-4">
                      <BookOpen className="w-5 h-5 text-blue-600" />
                      <h3 className="text-lg font-bold text-gray-900">使用指南</h3>
                    </div>
                    
                    <div className="space-y-4">
                      {/* Step 1: Data Preparation */}
                      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-3">
                          <div className="bg-blue-100 p-2 rounded-lg shrink-0">
                            <CheckSquare className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-1 text-sm">1. 数据准备</h4>
                            <p className="text-xs text-gray-600 mb-2">
                              支持 Excel (.xlsx) 格式。
                            </p>
                            <div className="bg-gray-50 p-2 rounded-lg text-[10px] text-gray-500 font-mono border border-gray-100 leading-relaxed">
                              Sheet名称 = 传感器类型<br/>
                              第一列 = 时间 (yyyy-MM-dd HH:mm:ss)<br/>
                              后续列 = 测点数据 (数值)
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Step 2: Import & Clean */}
                      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-3">
                          <div className="bg-green-100 p-2 rounded-lg shrink-0">
                            <Database className="w-5 h-5 text-green-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-1 text-sm">2. 数据导入与清洗</h4>
                            <p className="text-xs text-gray-600 mb-2">
                              选择本地文件或使用 API 批量获取。
                            </p>
                            <ul className="text-xs text-gray-500 list-disc list-inside space-y-0.5">
                              <li>支持多文件批量上传</li>
                              <li>自动过滤无效数据行</li>
                              <li>可在"文件管理"中批量重命名</li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      {/* Step 3: Analysis */}
                      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-3">
                          <div className="bg-purple-100 p-2 rounded-lg shrink-0">
                            <BarChart3 className="w-5 h-5 text-purple-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-1 text-sm">3. 可视化分析</h4>
                            <p className="text-xs text-gray-600 mb-2">
                              查看各测点的时程曲线和极值统计。
                            </p>
                            <ul className="text-xs text-gray-500 list-disc list-inside space-y-0.5">
                              <li>左侧导航快速切换结构</li>
                              <li>自动计算最大/最小值</li>
                              <li>支持图表缩放与详情查看</li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      {/* Step 4: Report Generation */}
                      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-3">
                          <div className="bg-orange-100 p-2 rounded-lg shrink-0">
                            <FileText className="w-5 h-5 text-orange-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-1 text-sm">4. 报告生成</h4>
                            <p className="text-xs text-gray-600 mb-2">
                              一键生成包含图表和统计数据的 Word 报告。
                            </p>
                            <ul className="text-xs text-gray-500 list-disc list-inside space-y-0.5">
                              <li>自动生成目录与章节编号</li>
                              <li>集成设备在线率统计表</li>
                              <li>所见即所得的模板编辑</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Upload Area */}
                <div className="lg:col-span-8 order-1 lg:order-2">
                  <div className="max-w-2xl mx-auto">
                    <div className="text-center mb-10">
                      <h2 className="text-3xl font-bold text-gray-900 mb-4">
                        开始您的分析
                      </h2>
                      <p className="text-lg text-gray-600">
                        上传结构监测数据（Excel），即刻生成时程曲线可视化报告，支持导出 Word 和 PDF。
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
                      <ApiImporter 
                        onImport={handleApiImport} 
                        onLogUpdate={handleImportLogs} 
                        onConfigUpdate={(order, groups) => {
                          setCustomOrder(order);
                          setCustomGroups(groups);
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {currentView === 'dashboard' && (
              <Dashboard 
                structures={structures} 
                importLogs={importLogs}
                onClear={handleClear} 
                onBack={handleBack} 
                customOrder={customOrder}
                customGroups={customGroups}
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

            {currentView === 'ai-config' && (
              <AiConfig onBack={() => setCurrentView('dashboard')} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
