import React from 'react';
import { ReportSection, SectionType } from '../types';
import { FileText, Activity, Server, List, Plus } from 'lucide-react';
import { cn } from '../utils/cn';

interface SectionNavigatorProps {
  sections: ReportSection[];
  onSectionClick: (sectionId: string) => void;
  onAddSection?: (type: SectionType) => void;
  stats?: {
    totalPages: number;
    totalCharts: number;
    totalWords: number;
  };
}

const SECTION_ICONS: Record<SectionType, React.ReactNode> = {
  text: <FileText className="w-4 h-4" />,
  chart_analysis: <Activity className="w-4 h-4" />,
  device_status: <Server className="w-4 h-4" />,
  toc: <List className="w-4 h-4" />,
};

const ADD_SECTION_ITEMS: { type: SectionType; label: string; icon: React.ReactNode }[] = [
  { type: 'text', label: '文本章节', icon: <FileText className="w-4 h-4" /> },
  { type: 'chart_analysis', label: '监测分析', icon: <Activity className="w-4 h-4" /> },
  { type: 'device_status', label: '设备状态', icon: <Server className="w-4 h-4" /> },
  { type: 'toc', label: '目录', icon: <List className="w-4 h-4" /> },
];

export function SectionNavigator({ sections, onSectionClick, onAddSection, stats }: SectionNavigatorProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full max-h-[calc(100vh-8rem)]">
      <div className="p-4 border-b border-gray-100 bg-gray-50">
        <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <List className="w-4 h-4 text-blue-600" />
          章节导航
        </h3>
        <p className="text-xs text-gray-500 mt-1">共 {sections.length} 个章节</p>
        
        {stats && (
          <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">预估页数</span>
              <span className="font-medium text-gray-900">~{stats.totalPages} 页</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">图表总数</span>
              <span className="font-medium text-gray-900">{stats.totalCharts} 个</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">文本字数</span>
              <span className="font-medium text-gray-900">~{stats.totalWords} 字</span>
            </div>
          </div>
        )}
      </div>
      
      <div className="overflow-y-auto flex-1 p-2 space-y-1">
        {sections.map((section, index) => (
          <button
            key={section.id}
            onClick={() => onSectionClick(section.id)}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-2 group"
          >
            <span className="text-xs text-gray-400 font-mono w-4 text-center group-hover:text-blue-400">
              {index + 1}
            </span>
            <span className="text-gray-400 shrink-0">
              {SECTION_ICONS[section.type]}
            </span>
            <span className="truncate flex-1">
              {section.title || '未命名章节'}
            </span>
          </button>
        ))}
        
        {sections.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-xs px-4">
            暂无章节
            <br />
            请在右侧添加
          </div>
        )}
      </div>

      {onAddSection && (
        <div className="p-3 border-t border-gray-100 bg-white">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-600 mb-2">
            <Plus className="w-3.5 h-3.5 text-blue-600" />
            新增章节
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ADD_SECTION_ITEMS.map(({ type, label, icon }) => (
              <button
                key={type}
                onClick={() => onAddSection(type)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-xs font-medium",
                  "bg-gray-50 border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700"
                )}
              >
                {icon}
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
