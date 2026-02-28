/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { UploadArea } from './components/UploadArea';
import { ApiImporter } from './components/ApiImporter';
import { Dashboard } from './components/Dashboard';
import { BridgeData } from './types';
import { parseExcelFile } from './utils/excel';
import { LayoutDashboard, Loader2, FileUp, Globe } from 'lucide-react';
import { cn } from './utils/cn';

export default function App() {
  const [bridges, setBridges] = useState<BridgeData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'file' | 'api'>('file');

  const [showDashboard, setShowDashboard] = useState(false);

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
      setShowDashboard(true);
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
    setShowDashboard(false);
  };

  const handleApiImport = (newBridges: BridgeData[]) => {
    setBridges((prev) => {
      const existingIds = new Set(prev.map(b => b.id));
      const uniqueNew = newBridges.filter(b => !existingIds.has(b.id));
      return [...prev, ...uniqueNew];
    });
    setShowDashboard(true);
  };

  const handleBack = () => {
    setShowDashboard(false);
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
              桥梁监测<span className="text-blue-600">分析系统</span>
            </h1>
          </div>
          <div className="text-sm text-gray-500">
            v1.0.0
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
            <div className={cn(showDashboard ? "hidden" : "block", "max-w-2xl mx-auto mt-20")}>
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
                <ApiImporter onImport={handleApiImport} />
              )}
              
              <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                <div className="p-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-600 font-bold">1</div>
                  <h3 className="font-medium text-gray-900">上传数据</h3>
                  <p className="text-sm text-gray-500 mt-1">拖拽或点击上传 Excel 文件</p>
                </div>
                <div className="p-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-600 font-bold">2</div>
                  <h3 className="font-medium text-gray-900">可视化分析</h3>
                  <p className="text-sm text-gray-500 mt-1">自动绘制时程曲线图</p>
                </div>
                <div className="p-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-600 font-bold">3</div>
                  <h3 className="font-medium text-gray-900">导出报告</h3>
                  <p className="text-sm text-gray-500 mt-1">一键生成 Word/PDF 报告</p>
                </div>
              </div>
            </div>

            {showDashboard && (
              <Dashboard bridges={bridges} onClear={handleClear} onBack={handleBack} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
