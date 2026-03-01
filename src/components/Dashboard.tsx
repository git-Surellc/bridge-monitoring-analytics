import React, { useEffect, useRef, useState } from 'react';
import { BridgeData, ReportCover, ReportSection, ReportTemplate, SectionType } from '../types';
import { SensorChart } from './SensorChart';
import { CoverEditor } from './CoverEditor';
import { TemplateEditor } from './TemplateEditor';
import { SectionNavigator } from './SectionNavigator';
import { FileDown, FileText, Activity, Trash2, LayoutTemplate, Loader2, ArrowLeft, ArrowDown, ArrowUp } from 'lucide-react';
import html2canvas from 'html2canvas';
import { generateWordReport } from '../utils/export';
import jsPDF from 'jspdf';

interface DashboardProps {
  bridges: BridgeData[];
  onClear: () => void;
  onBack?: () => void;
}

const DEFAULT_TEMPLATE: ReportTemplate = {
  id: 'default',
  name: '默认模板',
  cover: {
    organization: '',
    project: '',
    title: '',
    period: '',
    footerCompany: '',
    footerDate: '',
  },
  sections: [
    { id: '1', type: 'toc', title: '目录' },
    { id: '2', type: 'text', title: '1. 项目概述', content: '在此输入项目概述...' },
    { id: '3', type: 'text', title: '2. 监测目的', content: '在此输入监测目的...' },
    { id: '4', type: 'device_status', title: '3. 设备在线情况' },
    { id: '5', type: 'chart_analysis', title: '4. 监测数据分析与预警' },
    { id: '6', type: 'text', title: '5. 评估结论及建议', content: '在此输入评估结论...' },
  ]
};

export function Dashboard({ bridges, onClear, onBack }: DashboardProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string>('');
  const [reportCover, setReportCover] = useState<ReportCover>({} as ReportCover);
  const [template, setTemplate] = useState<ReportTemplate>(DEFAULT_TEMPLATE);
  const [showTemplateEditor, setShowTemplateEditor] = useState(true);
  const [activeArea, setActiveArea] = useState<'editor' | 'preview'>('editor');
  const reportRef = useRef<HTMLDivElement>(null);
  const areaVisibilityRef = useRef<{ editor: number; preview: number }>({ editor: 0, preview: 0 });

  // Calculate report statistics
  const totalCharts = bridges.reduce((acc, bridge) => acc + bridge.sensors.length, 0);
  const totalWords = template.sections.reduce((acc, section) => {
    return acc + (section.content?.length || 0);
  }, 0);
  
  // Estimate pages: Cover(1) + TOC(1) + Device Status(1) + Text(~500 chars/page) + Charts(4/page)
  const totalPages = 1 + 1 + 1 + 
    Math.ceil(totalWords / 500) + 
    Math.ceil(totalCharts / 4);

  const handleSectionClick = (sectionId: string) => {
    // If template editor is hidden, show it first
    if (!showTemplateEditor) {
      setShowTemplateEditor(true);
      // Wait for render
      setTimeout(() => {
        const element = document.getElementById(`editor-section-${sectionId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return;
    }
    
    const element = document.getElementById(`editor-section-${sectionId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleAddSection = (type: SectionType) => {
    const id = crypto.randomUUID();
    const newSection: ReportSection = {
      id,
      type,
      title: type === 'toc' ? '目录' : '新章节',
      content: type === 'text' ? '' : undefined,
      apiUrl: type === 'device_status' ? 'https://api.example.com/status' : undefined,
    };

    setTemplate((prev) => ({
      ...prev,
      sections: [...prev.sections, newSection],
    }));

    if (!showTemplateEditor) {
      setShowTemplateEditor(true);
    }

    setTimeout(() => {
      const element = document.getElementById(`editor-section-${id}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const handleExportWord = async () => {
    if (isExporting) return;
    
    setIsExporting(true);
    setExportProgress('准备导出...');
    
    // Allow UI to update
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      const chartImages: Record<string, { data: string, width: number, height: number }> = {};
      
      if (!reportRef.current) return;

      const charts = reportRef.current.querySelectorAll('.sensor-chart-container');
      
      for (let i = 0; i < charts.length; i++) {
        setExportProgress(`正在生成图表 ${i + 1}/${charts.length}...`);
        // Allow UI to update between heavy chart renders
        await new Promise(resolve => setTimeout(resolve, 10));
        
        const chartEl = charts[i] as HTMLElement;
        const id = chartEl.dataset.id;
        if (id) {
          const canvas = await html2canvas(chartEl, {
            scale: 4, // Increase scale for better quality in Word
            logging: false,
          });
          chartImages[id] = {
            data: canvas.toDataURL('image/png'),
            width: canvas.width,
            height: canvas.height
          };
        }
      }

      setExportProgress('正在生成 Word 文档...');
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await generateWordReport(bridges, chartImages, reportCover, template.sections);
    } catch (error) {
      console.error("Export failed", error);
      alert("Failed to export report");
    } finally {
      setIsExporting(false);
      setExportProgress('');
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      if (!reportRef.current) return;
      
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfImgHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfImgHeight);
      pdf.save("Monitoring_Report.pdf");

    } catch (error) {
      console.error("PDF Export failed", error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleScrollToPreview = () => {
    const element = document.getElementById('report-preview-section');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleScrollToEditor = () => {
    const element = document.getElementById('template-editor-section');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  useEffect(() => {
    const editorEl = document.getElementById('template-editor-section');
    const previewEl = document.getElementById('report-preview-section');
    if (!editorEl || !previewEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target.id === 'template-editor-section') {
            areaVisibilityRef.current.editor = entry.intersectionRatio;
          }
          if (entry.target.id === 'report-preview-section') {
            areaVisibilityRef.current.preview = entry.intersectionRatio;
          }
        }

        const nextArea =
          areaVisibilityRef.current.preview >= areaVisibilityRef.current.editor ? 'preview' : 'editor';
        setActiveArea(nextArea);
      },
      {
        threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
      }
    );

    observer.observe(editorEl);
    observer.observe(previewEl);

    return () => observer.disconnect();
  }, []);

  return (
    <div className="space-y-8">
      <button
        onClick={activeArea === 'editor' ? handleScrollToPreview : handleScrollToEditor}
        className="fixed right-6 bottom-6 z-30 flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors print:hidden"
      >
        {activeArea === 'editor' ? (
          <>
            跳转到预览
            <ArrowDown className="w-4 h-4" />
          </>
        ) : (
          <>
            返回编辑
            <ArrowUp className="w-4 h-4" />
          </>
        )}
      </button>
      <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100 sticky top-[64px] z-20">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">分析仪表盘</h2>
          <p className="text-gray-500">已加载 {bridges.length} 座桥梁数据</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowTemplateEditor(!showTemplateEditor)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors border ${
              showTemplateEditor 
                ? 'bg-blue-50 border-blue-200 text-blue-700' 
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <LayoutTemplate className="w-4 h-4" />
            {showTemplateEditor ? '隐藏模板编辑' : '编辑报告模板'}
          </button>
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回导入
            </button>
          )}
          <button
            onClick={onClear}
            className="flex items-center gap-2 px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            清空数据
          </button>
          <button
            onClick={handleExportWord}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 min-w-[140px] justify-center"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {isExporting ? (exportProgress || '生成中...') : '导出 Word'}
          </button>
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white hover:bg-gray-900 rounded-lg transition-colors disabled:opacity-50"
          >
            <FileDown className="w-4 h-4" />
            导出 PDF
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-12 relative">
        {/* Editor Area */}
        <div id="template-editor-section" className="w-full space-y-8 relative scroll-mt-32">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5" />
              模板编辑区域
            </h3>
          </div>

          <div className="flex flex-col lg:flex-row gap-8 items-start">
             {/* Section Navigator - Sticky within Editor Area */}
             <div className="w-full lg:w-48 shrink-0 lg:sticky top-48 self-start max-h-[calc(100vh-12rem)] overflow-y-auto">
              <SectionNavigator 
                sections={template.sections} 
                onSectionClick={handleSectionClick}
                onAddSection={handleAddSection}
                stats={{
                  totalPages,
                  totalCharts,
                  totalWords
                }}
              />
            </div>
            
            <div className="w-full flex-1 min-w-0 space-y-8">
              <CoverEditor cover={reportCover} onChange={setReportCover} />
              {showTemplateEditor && (
                <TemplateEditor template={template} onUpdate={setTemplate} />
              )}
            </div>
          </div>
        </div>

        {/* Preview Area */}
        <div id="report-preview-section" className="w-full min-w-0 relative scroll-mt-32">
          <div className="flex items-center gap-2 mb-4 print:hidden">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              报告预览区域
            </h3>
          </div>
          <div ref={reportRef} className="bg-white p-8 rounded-xl border border-gray-100 min-h-screen shadow-sm print:p-0 print:shadow-none print:border-none">
            
            {/* Cover Page Preview */}
            <div className="flex flex-col items-center justify-between min-h-[1123px] py-20 bg-white mb-8 border-b-4 border-double border-gray-200 print:border-none break-after-page">
               <div className="w-full text-center space-y-16 mt-20">
                  <h1 className="text-4xl font-extrabold text-gray-900 tracking-wider leading-relaxed">{reportCover.organization || '组织机构名称'}</h1>
                  <h2 className="text-3xl font-bold text-gray-800 tracking-wide">{reportCover.project || '项目名称'}</h2>
               </div>

               <div className="w-full text-center space-y-8">
                  <h3 className="text-3xl font-bold text-gray-900">{reportCover.title || '报告标题'}</h3>
                  <p className="text-2xl font-bold text-gray-800 font-mono">{reportCover.period || '监测周期'}</p>
               </div>

               <div className="w-full text-center space-y-4 mb-32">
                   <div className="flex items-center justify-center gap-3">
                       <div className="w-8 h-8 rounded-full border-2 border-gray-800 flex items-center justify-center opacity-80">
                           <div className="w-4 h-4 border border-gray-800 rotate-45"></div>
                       </div>
                       <div className="text-xl font-bold text-gray-800">{reportCover.footerCompany || '落款公司名称'}</div>
                   </div>
                   <p className="text-xl font-bold text-gray-800">{reportCover.footerDate || '落款日期'}</p>
               </div>
            </div>

            {/* Dynamic Sections Preview */}
            <div className="space-y-16 max-w-full mx-auto">
              {template.sections.map((section) => (
                <div key={section.id} className="space-y-6">
                  {section.type !== 'toc' && (
                    <h2 className="text-2xl font-bold text-gray-900 border-b pb-2">{section.title}</h2>
                  )}

                  {section.type === 'toc' && (
                    <div className="bg-gray-50 p-8 rounded-lg border border-gray-200 text-center text-gray-500">
                      [此处将在导出时生成目录]
                    </div>
                  )}

                  {section.type === 'text' && (
                    <div className="prose max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {section.content || '(无内容)'}
                    </div>
                  )}

                  {section.type === 'device_status' && (
                    <div className="border border-gray-200 rounded-lg overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">设备ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">设备名称</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">最后更新时间</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {[1, 2, 3].map((i) => (
                            <tr key={i}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">DEV-{1000 + i}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">传感器-{i}</td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                  在线
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">2026-02-28 10:00:00</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="bg-gray-50 px-4 py-2 text-xs text-gray-400 text-center border-t border-gray-200">
                        * 预览数据，实际导出时将调用接口: {section.apiUrl || '默认接口'}
                      </div>
                    </div>
                  )}

                  {section.type === 'chart_analysis' && (
                    <div className="space-y-12">
                      {bridges.length > 0 ? bridges.map((bridge) => (
                        <div key={bridge.id} className="space-y-8">
                          <h3 className="text-xl font-semibold text-gray-800 pl-4 border-l-4 border-blue-500">{bridge.name}</h3>
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                            {bridge.sensors.map((sensor) => (
                              <div 
                                key={sensor.id} 
                                className="sensor-chart-container space-y-4 break-inside-avoid"
                                data-id={`${bridge.id}-${sensor.id}`}
                              >
                                <div className="flex justify-between items-end">
                                  <h4 className="text-lg font-medium text-gray-700">
                                    {sensor.name}
                                  </h4>
                                  <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-1 rounded">
                                    ID: {sensor.id}
                                  </span>
                                </div>

                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                  <SensorChart sensor={sensor} />
                                </div>

                                {sensor.stats && (
                                  <div className="bg-blue-50 rounded-lg p-4 text-sm text-gray-700 border border-blue-100">
                                    <h5 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                                      <Activity className="w-4 h-4" />
                                      分析摘要
                                    </h5>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      <div>
                                        <span className="text-gray-500 block text-xs uppercase tracking-wider">最大值</span>
                                        <span className="font-mono font-medium text-lg">
                                          {sensor.stats.max}
                                        </span>
                                        <span className="text-xs text-gray-400 block">时间：{sensor.stats.maxTime}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500 block text-xs uppercase tracking-wider">最小值</span>
                                        <span className="font-mono font-medium text-lg">
                                          {sensor.stats.min}
                                        </span>
                                        <span className="text-xs text-gray-400 block">时间：{sensor.stats.minTime}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500 block text-xs uppercase tracking-wider">振幅/变化量</span>
                                        <span className="font-mono font-medium text-lg text-blue-600">
                                          {sensor.stats.amplitude}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-blue-100 text-blue-800 text-xs">
                                      状态：数据波动在正常范围内。
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )) : (
                        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 text-gray-400">
                          暂无监测数据，请上传 Excel 文件
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
