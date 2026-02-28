import React, { useEffect } from 'react';
import { ReportCover } from '../types';
import { FileText, Calendar, Building, Building2 } from 'lucide-react';

interface CoverEditorProps {
  cover: ReportCover;
  onChange: (cover: ReportCover) => void;
}

export function CoverEditor({ cover, onChange }: CoverEditorProps) {
  const handleChange = (field: keyof ReportCover, value: string) => {
    onChange({ ...cover, [field]: value });
  };

  // Set default values if empty on mount
  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const lastMonth = month === 1 ? 12 : month - 1;
    const lastMonthYear = month === 1 ? year - 1 : year;
    
    // Calculate last month's last day
    const lastDayOfLastMonth = new Date(year, month - 1, 0).getDate();

    const defaults: Partial<ReportCover> = {
      organization: '承德市公路养护事业发展中心',
      project: '技术性监测预警项目',
      title: `${lastMonthYear} 年 ${lastMonth} 月份桥隧监测数据分析报告`,
      period: `(${lastMonthYear}.${lastMonth}.1~${lastMonthYear}.${lastMonth}.${lastDayOfLastMonth})`,
      footerCompany: '中路高科交通检测检验认证有限公司',
      footerDate: `${year} 年 ${month} 月`
    };

    const newCover = { ...cover };
    let hasChanges = false;

    (Object.keys(defaults) as Array<keyof ReportCover>).forEach((key) => {
      if (!newCover[key]) {
        newCover[key] = defaults[key]!;
        hasChanges = true;
      }
    });

    if (hasChanges) {
      onChange(newCover);
    }
  }, []);

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-4">
        <FileText className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-semibold text-gray-900">报告封面设置</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <div className="flex items-center gap-1.5">
                <Building className="w-4 h-4 text-gray-400" />
                组织机构名称
              </div>
            </label>
            <input
              type="text"
              value={cover.organization}
              onChange={(e) => handleChange('organization', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="例如：承德市公路养护事业发展中心"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <div className="flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-gray-400" />
                项目名称
              </div>
            </label>
            <input
              type="text"
              value={cover.project}
              onChange={(e) => handleChange('project', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="例如：技术性监测预警项目"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <div className="flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-gray-400" />
                报告标题
              </div>
            </label>
            <input
              type="text"
              value={cover.title}
              onChange={(e) => handleChange('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="例如：2026 年 1 月份桥隧监测数据分析报告"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-gray-400" />
                监测周期
              </div>
            </label>
            <input
              type="text"
              value={cover.period}
              onChange={(e) => handleChange('period', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="例如：(2026.1.1~2026.1.31)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <div className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-gray-400" />
                落款公司名称
              </div>
            </label>
            <input
              type="text"
              value={cover.footerCompany}
              onChange={(e) => handleChange('footerCompany', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="例如：中路高科交通检测检验认证有限公司"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-gray-400" />
                落款日期
              </div>
            </label>
            <input
              type="text"
              value={cover.footerDate}
              onChange={(e) => handleChange('footerDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="例如：2026 年 2 月"
            />
          </div>
        </div>
      </div>
      
      {/* Preview Area */}
      <div className="mt-8 pt-8 border-t border-gray-200">
        <h4 className="text-sm font-medium text-gray-500 mb-4 uppercase tracking-wider text-center">封面预览</h4>
        <div className="bg-white border border-gray-200 shadow-lg aspect-[210/297] w-full max-w-sm mx-auto p-8 flex flex-col items-center text-center relative overflow-hidden">
          {/* Top Section */}
          <div className="mt-12 space-y-6 w-full">
            <h1 className="text-xl font-bold text-gray-900 leading-tight">{cover.organization || '组织机构名称'}</h1>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">{cover.project || '项目名称'}</h2>
          </div>

          {/* Middle Section */}
          <div className="flex-1 flex flex-col justify-center space-y-4 w-full">
            <h3 className="text-lg font-bold text-gray-900">{cover.title || '报告标题'}</h3>
            <p className="text-lg font-bold text-gray-900">{cover.period || '监测周期'}</p>
          </div>

          {/* Bottom Section */}
          <div className="mb-12 space-y-4 w-full">
            <div className="flex items-center justify-center gap-2">
               {/* Logo placeholder - using a simple icon for now */}
               <div className="w-6 h-6 rounded-full border-2 border-gray-400 flex items-center justify-center">
                 <div className="w-3 h-3 border border-gray-400 rotate-45"></div>
               </div>
               <p className="text-sm font-medium text-gray-800">{cover.footerCompany || '落款公司名称'}</p>
            </div>
            <p className="text-sm font-medium text-gray-800">{cover.footerDate || '落款日期'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
