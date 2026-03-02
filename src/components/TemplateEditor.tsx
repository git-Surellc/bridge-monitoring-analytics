import React, { useState } from 'react';
import { ReportTemplate, ReportSection } from '../types';
import { Trash2, ArrowUp, ArrowDown, Activity, Server, List, LayoutTemplate, Upload } from 'lucide-react';
import { cn } from '../utils/cn';
import * as mammoth from 'mammoth';

interface TemplateEditorProps {
  template: ReportTemplate;
  onUpdate: (template: ReportTemplate) => void;
}

export function TemplateEditor({ template, onUpdate }: TemplateEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleUpdateSection = (id: string, updates: Partial<ReportSection>) => {
    onUpdate({
      ...template,
      sections: template.sections.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    });
  };

  const handleDeleteSection = (id: string) => {
    if (confirm('确定要删除此章节吗？')) {
      onUpdate({
        ...template,
        sections: template.sections.filter((s) => s.id !== id),
      });
    }
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    const newSections = [...template.sections];
    if (direction === 'up' && index > 0) {
      [newSections[index], newSections[index - 1]] = [newSections[index - 1], newSections[index]];
    } else if (direction === 'down' && index < newSections.length - 1) {
      [newSections[index], newSections[index + 1]] = [newSections[index + 1], newSections[index]];
    }
    onUpdate({ ...template, sections: newSections });
  };

  const handleFileUpload = async (file: File, sectionId: string) => {
    try {
      let text = '';
      if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      } else {
        text = await file.text();
      }
      
      // Auto-formatting (placeholder logic as requested)
      // For now, just trim and normalize newlines
      text = text.replace(/\r\n/g, '\n').trim();
      
      handleUpdateSection(sectionId, { content: text });
    } catch (error) {
      console.error('File upload failed:', error);
      alert('文件导入失败，请重试');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-6 py-4 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <LayoutTemplate className="w-5 h-5 text-blue-600" />
          报告模板
        </h3>
      </div>

      <div className="p-6 space-y-6">
        {template.sections.map((section, index) => (
          <div
            key={section.id}
            id={`editor-section-${section.id}`}
            className={cn(
              "border rounded-xl p-5 transition-all duration-200 group relative",
              editingId === section.id 
                ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/10 shadow-lg" 
                : "border-gray-200 hover:border-blue-300 hover:shadow-md bg-white"
            )}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 mr-4">
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  章节标题
                </label>
                <input
                  type="text"
                  value={section.title}
                  onChange={(e) => handleUpdateSection(section.id, { title: e.target.value })}
                  onFocus={() => setEditingId(section.id)}
                  onBlur={() => setEditingId(null)}
                  className="w-full text-lg font-medium text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none hover:bg-white"
                  placeholder="输入标题..."
                />
              </div>
              <div className="flex items-center gap-2 mt-6">
                <button
                  onClick={() => handleMoveSection(index, 'up')}
                  disabled={index === 0}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  title="上移"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleMoveSection(index, 'down')}
                  disabled={index === template.sections.length - 1}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  title="下移"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteSection(section.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-1"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {section.type === 'text' && (
                <div>
                  <div className="flex justify-between items-center mb-1">
                     <label className="block text-sm font-medium text-gray-500">
                      内容
                    </label>
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-2 py-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors">
                      <Upload className="w-3 h-3" />
                      导入 Word/文本
                      <input
                        type="file"
                        accept=".txt,.docx"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, section.id);
                          // Reset input value to allow selecting the same file again
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                  <textarea
                    value={section.content || ''}
                    onChange={(e) => handleUpdateSection(section.id, { content: e.target.value })}
                    onFocus={() => setEditingId(section.id)}
                    onBlur={() => setEditingId(null)}
                    rows={6}
                    className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none hover:bg-white resize-y"
                    placeholder="输入章节内容..."
                  />
                  <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-blue-400"></span>
                    支持导入 .docx 或 .txt 文件，导入后将自动优化格式
                  </p>
                </div>
              )}

              {section.type === 'device_status' && (
                <div className="space-y-3">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">API 接口配置</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Server className="h-4 w-4 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        value={section.apiUrl || ''}
                        onChange={(e) => handleUpdateSection(section.id, { apiUrl: e.target.value })}
                        className="block w-full pl-10 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white transition-colors"
                        placeholder="https://api.example.com/devices/status"
                      />
                    </div>
                    <button className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg border border-slate-200 hover:bg-slate-200 hover:border-slate-300 transition-colors shadow-sm">
                      测试连接
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    系统将调用此接口获取设备在线状态列表并生成表格
                  </p>
                </div>
              )}
              
              {section.type === 'chart_analysis' && (
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-sm text-slate-500 flex items-center gap-3">
                  <Activity className="w-5 h-5 text-blue-400" />
                  <div>
                    <p className="font-medium text-slate-700">自动生成图表分析</p>
                    <p className="text-xs mt-0.5">该章节将自动包含所有选中结构传感器的监测数据图表及统计分析。</p>
                  </div>
                </div>
              )}

              {section.type === 'toc' && (
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-sm text-slate-500 flex items-center gap-3">
                  <List className="w-5 h-5 text-blue-400" />
                  <div>
                    <p className="font-medium text-slate-700">自动目录</p>
                    <p className="text-xs mt-0.5">导出 Word 时将根据章节结构自动生成带页码的目录。</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {template.sections.length === 0 && (
          <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-gray-400">
            暂无章节，请从左侧导航栏下方添加
          </div>
        )}
      </div>
    </div>
  );
}
