import React, { useEffect, useRef, useState } from 'react';
import { StructureData, ReportCover, ReportSection, ReportTemplate, SectionType, LogEntry } from '../types';
import { SensorChart } from './SensorChart';
import { CoverEditor } from './CoverEditor';
import { TemplateEditor } from './TemplateEditor';
import { SectionNavigator } from './SectionNavigator';
import { FileDown, FileText, Activity, Trash2, LayoutTemplate, Loader2, ArrowLeft, ArrowDown, ArrowUp, AlertTriangle, RefreshCw, Server, CheckCircle2, XCircle, Brain, Sparkles } from 'lucide-react';
import { cn } from '../utils/cn';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { AnalysisToolbar } from './AnalysisToolbar';
import { AnalysisResultView } from './AnalysisResultView';
import { AnalysisConfig, analyzeStructure, analyzeWithAI, StructureAnalysisResult, getSensorType, generateAiPrompt, sortStructuresByUserOrder, groupStructures, StructureGroup } from '../utils/analysis';

interface DashboardProps {
  structures: StructureData[];
  importLogs?: LogEntry[];
  onClear: () => void;
  onBack?: () => void;
  customOrder?: string;
  customGroups?: string;
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

export function Dashboard({ structures, importLogs = [], onClear, onBack, customOrder, customGroups }: DashboardProps) {
  // Process structures with custom order and grouping
  const processedStructures = React.useMemo(() => {
    return sortStructuresByUserOrder(structures, customOrder || '');
  }, [structures, customOrder]);

  const structureGroups = React.useMemo(() => {
    if (!customGroups || !customGroups.trim()) return null;
    return groupStructures(processedStructures, customGroups);
  }, [processedStructures, customGroups]);

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string>('');
  const [reportCover, setReportCover] = useState<ReportCover>({} as ReportCover);
  const [template, setTemplate] = useState<ReportTemplate>(DEFAULT_TEMPLATE);
  const [showTemplateEditor, setShowTemplateEditor] = useState(true);
  const [activeArea, setActiveArea] = useState<'editor' | 'preview'>('editor');
  const [showImportErrors, setShowImportErrors] = useState(false);
  const [expandedAnalysisStructureId, setExpandedAnalysisStructureId] = useState<string | null>(null);
  const [renderedSensorCharts, setRenderedSensorCharts] = useState<Record<string, boolean>>({});
  
  // Device Status State
  const [deviceStatuses, setDeviceStatuses] = useState<any[]>([]);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [statusLastUpdated, setStatusLastUpdated] = useState<string | null>(null);

  // Analysis State
  const [analysisConfig, setAnalysisConfig] = useState<AnalysisConfig>(() => {
    const saved = localStorage.getItem('analysis_config');
    return saved ? JSON.parse(saved) : {
      enableGlobal: false,
      enableAi: false,
      enableInclination: true,
      enableDisplacement: true,
      enableAcceleration: true,
      enableTemperature: true,
      enableCrack: true,
      enableCorrelation: true
    };
  });
  const [analysisResults, setAnalysisResults] = useState<Record<string, StructureAnalysisResult>>({});
  const [aiResults, setAiResults] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('ai_results_cache');
    return saved ? JSON.parse(saved) : {};
  });
  const [isAiLoading, setIsAiLoading] = useState<Record<string, boolean>>({});
  const [hasAiConfig, setHasAiConfig] = useState(false);
  const [aiBatchId, setAiBatchId] = useState<string | null>(null);

  const reportRef = useRef<HTMLDivElement>(null);
  const areaVisibilityRef = useRef<{ editor: number; preview: number }>({ editor: 0, preview: 0 });

  // Calculate import stats
  const importStats = {
    total: importLogs.length,
    success: importLogs.filter(l => l.status === 'success' || l.status === 'skipped').length,
    failed: importLogs.filter(l => l.status === 'error').length,
    failedLogs: importLogs.filter(l => l.status === 'error')
  };

  // Auto-show errors if there are failures and we just mounted
  useEffect(() => {
    if (importStats.failed > 0) {
      setShowImportErrors(true);
    }
  }, []);

  useEffect(() => {
    setRenderedSensorCharts({});
    if (expandedAnalysisStructureId && !structures.some(b => b.id === expandedAnalysisStructureId)) {
      setExpandedAnalysisStructureId(null);
    }
  }, [structures]);

  // Sync Analysis Config with LocalStorage
  useEffect(() => {
    localStorage.setItem('analysis_config', JSON.stringify(analysisConfig));
  }, [analysisConfig]);

  // Check for AI Config
  useEffect(() => {
    const config = localStorage.getItem('ai_config');
    setHasAiConfig(!!config);
  }, []);

  // Perform Structure Analysis
  useEffect(() => {
    if (!analysisConfig.enableGlobal) {
      setAnalysisResults({});
      return;
    }

    const newResults: Record<string, StructureAnalysisResult> = {};
    processedStructures.forEach(structure => {
      const result = analyzeStructure(structure, analysisConfig);
      if (result) {
        newResults[structure.id] = result;
      }
    });
    setAnalysisResults(newResults);
  }, [processedStructures, analysisConfig]);

  // Perform AI Analysis (Manual Trigger Only)
  /* 
  // Auto-trigger disabled as per user request for manual control
  useEffect(() => {
    if (!analysisConfig.enableGlobal || !analysisConfig.enableAi || !hasAiConfig) return;

    if (expandedAnalysisStructureId) {
      const structure = structures.find(s => s.id === expandedAnalysisStructureId);
      if (structure && !aiResults[structure.id] && !isAiLoading[structure.id]) {
        const savedConfig = localStorage.getItem('ai_config');
        if (!savedConfig) return;
        
        const aiConfig = JSON.parse(savedConfig);
        setIsAiLoading(prev => ({ ...prev, [structure.id]: true }));
        
        analyzeWithAI(structure, aiConfig)
          .then(res => {
            if (res) {
              setAiResults(prev => ({ ...prev, [structure.id]: res }));
            }
          })
          .catch(err => console.error('AI Analysis failed:', err))
          .finally(() => {
            setIsAiLoading(prev => ({ ...prev, [structure.id]: false }));
          });
      }
    }
  }, [expandedAnalysisStructureId, analysisConfig.enableGlobal, analysisConfig.enableAi, hasAiConfig, structures]);
  */

  // Restore AI Batch State on Mount
  useEffect(() => {
    const savedBatchId = localStorage.getItem('ai_batch_id');
    if (savedBatchId) {
      setAiBatchId(savedBatchId);
    }
  }, []);

  // Poll AI Batch Status
  useEffect(() => {
    if (!aiBatchId) return;

    let isMounted = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/ai/batch/status/${aiBatchId}`);
        if (!res.ok) {
          if (res.status === 404) {
            // Batch not found (maybe server restarted), clear it
            localStorage.removeItem('ai_batch_id');
            if (isMounted) {
              setAiBatchId(null);
              setIsAiLoading({});
            }
          }
          return;
        }
        const status = await res.json();
        
        if (!isMounted) return;

        // Update aiResults
        const newResults: Record<string, string> = {};
        const newLoading: Record<string, boolean> = {};
        
        status.tasks.forEach((task: any) => {
          if (task.status === 'completed' && task.result) {
            newResults[task.id] = task.result;
            newLoading[task.id] = false;
          } else if (task.status === 'failed') {
            newLoading[task.id] = false;
            // Optionally show error in UI, but for now just stop loading
          } else {
            newLoading[task.id] = true;
          }
        });
        
        setAiResults(prev => {
          const next = { ...prev, ...newResults };
          localStorage.setItem('ai_results_cache', JSON.stringify(next));
          return next;
        });
        
        // Only update loading state if changed (to avoid too many re-renders)
        setIsAiLoading(prev => ({ ...prev, ...newLoading }));

        if (status.isComplete) {
          localStorage.removeItem('ai_batch_id');
          setAiBatchId(null);
          setIsAiLoading({}); // Clear all loading
        }
      } catch (e) {
        console.error('Poll error', e);
      }
    };

    const interval = setInterval(poll, 2000);
    poll(); // immediate run

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [aiBatchId]);

  const handleRunAiAnalysis = async (structureId?: string) => {
    if (!analysisConfig.enableGlobal || !analysisConfig.enableAi || !hasAiConfig) return;
    
    const savedConfig = localStorage.getItem('ai_config');
    if (!savedConfig) {
      alert('请先配置 AI 接口信息');
      return;
    }
    const aiConfig = JSON.parse(savedConfig);

    const targetStructures = structureId 
      ? processedStructures.filter(s => s.id === structureId)
      : processedStructures;

    if (targetStructures.length === 0) return;

    // Check if already running (simple check)
    if (aiBatchId) {
      const confirm = window.confirm('已有正在进行的 AI 分析任务，是否重新开始？');
      if (!confirm) return;
    }

    // Set loading state
    const loadingState: Record<string, boolean> = {};
    targetStructures.forEach(s => loadingState[s.id] = true);
    setIsAiLoading(prev => ({ ...prev, ...loadingState }));

    try {
      // Prepare tasks
      const tasks = targetStructures.map(s => ({
        id: s.id,
        name: s.name,
        prompt: generateAiPrompt(s.name, s.sensors)
      }));

      const res = await fetch('/api/ai/batch/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks, config: aiConfig })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to start batch');
      }
      
      const { batchId } = await res.json();
      setAiBatchId(batchId);
      localStorage.setItem('ai_batch_id', batchId);

    } catch (err) {
      console.error('Batch AI Analysis failed:', err);
      alert(`启动 AI 分析失败: ${err instanceof Error ? err.message : '未知错误'}`);
      setIsAiLoading(prev => {
        const next = { ...prev };
        targetStructures.forEach(s => delete next[s.id]);
        return next;
      });
    }
  };

  const handleStopAiAnalysis = async () => {
    try {
      const id = aiBatchId || localStorage.getItem('ai_batch_id');
      if (id) {
        await fetch('/api/ai/batch/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId: id })
        }).catch(() => {});
      }
    } finally {
      localStorage.removeItem('ai_batch_id');
      setAiBatchId(null);
      setIsAiLoading({});
    }
  };

  // Compute Available Types for Toolbar
  const availableTypes = React.useMemo(() => {
    const types = new Set<string>();
    const targetStructure = processedStructures.find(s => s.id === expandedAnalysisStructureId);
    // If a structure is expanded, show its types. Otherwise show all types.
    const source = targetStructure ? [targetStructure] : processedStructures;
    
    source.forEach(s => {
      s.sensors.forEach(sensor => {
        const type = getSensorType(sensor);
        if (type) types.add(type);
      });
    });
    return types;
  }, [processedStructures, expandedAnalysisStructureId]);

  const handleAnalysisConfigChange = (key: keyof AnalysisConfig, value: boolean) => {
    setAnalysisConfig(prev => ({ ...prev, [key]: value }));
  };

  const refreshDeviceStatus = async () => {
    setIsRefreshingStatus(true);
    try {
      const structureList = processedStructures.map(b => ({
        id: b.id,
        name: b.name,
        type: b.type || '1'
      }));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s frontend timeout

      const res = await fetch('/api/devices/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structures: structureList }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) throw new Error('Failed to fetch status');
      const data = await res.json();
      
      setDeviceStatuses(data);
      setStatusLastUpdated(new Date().toLocaleString());
      return data;
    } catch (err) {
      console.error('Failed to refresh device status', err);
      // Don't alert during export to avoid blocking flow, just log
      // alert('获取设备状态失败: ' + (err instanceof Error ? err.message : 'Unknown error'));
      return null;
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  // Calculate report statistics
  const totalCharts = processedStructures.reduce((acc, structure) => acc + structure.sensors.length, 0);
  const totalWords = template.sections.reduce((acc, section) => {
    return acc + (section.content?.length || 0);
  }, 0);
  
  // Estimate pages: Cover(1) + TOC(1) + Device Status(1) + Text(~500 chars/page) + Charts(4/page)
  const totalPages = 1 + 1 + 1 + 
    Math.ceil(totalWords / 500) + 
    Math.ceil(totalCharts / 4);
  
  const deviceTypeColumns = Array.from(new Set(
    deviceStatuses.flatMap(d => Object.keys(d?.stats?.types || {}))
  )).filter(Boolean).sort();

  const formatRate = (online?: number, total?: number) => {
    if (!total) return '-';
    const percent = Math.round(((online || 0) / total) * 100);
    return `${percent}% (${online || 0}/${total})`;
  };

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
      title: type === 'text' ? '新建文本章节' : 
             type === 'chart_analysis' ? '监测数据分析与预警' : 
             type === 'device_status' ? '设备在线率统计' : 
             type === 'conclusion' ? '评估结论及建议' : '目录',
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
    setExportProgress('正在提交生成任务...');
    
    setTimeout(async () => {
      try {
        // Ensure we have device statuses
        let currentStatuses = deviceStatuses;
        if (!currentStatuses || currentStatuses.length === 0) {
           setExportProgress('正在同步设备状态...');
           const fetched = await refreshDeviceStatus();
           if (fetched) currentStatuses = fetched;
        }

        setExportProgress('正在提交生成任务...');

        // 1. Submit task to backend
        // Enrich structures with AI analysis results and algorithm results
        // Use processedStructures to ensure correct order
        const bridgesWithAi = processedStructures.map(s => ({
          ...s,
          aiAnalysis: aiResults[s.id] || null,
          analysis: analysisResults[s.id] || null
        }));

        // Prepare groups if they exist
        let exportGroups = null;
        if (structureGroups) {
          exportGroups = structureGroups.map(g => ({
            name: g.name,
            structures: g.structures.map(s => ({
               ...s,
               aiAnalysis: aiResults[s.id] || null,
               analysis: analysisResults[s.id] || null
            }))
          }));
        }

        const response = await fetch('/api/reports/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            bridges: bridgesWithAi, // Sorted flat list
            groups: exportGroups,   // Grouped list (optional)
            cover: reportCover,
            sections: template.sections,
            deviceStatuses: currentStatuses,
          }),
        });


        if (!response.ok) {
          throw new Error(`Failed to start task: ${response.statusText}`);
        }

        const { taskId } = await response.json();
        
        // 2. Poll for status
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/reports/task/${taskId}`);
            if (!statusRes.ok) return;
            
            const task = await statusRes.json();
            
            if (task.status === 'completed') {
              clearInterval(pollInterval);
              setExportProgress('下载中...');
              
              // Trigger download
              const link = document.createElement('a');
              link.href = task.downloadUrl;
              link.download = task.fileName;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              
              setIsExporting(false);
              setExportProgress('');
            } else if (task.status === 'failed') {
              clearInterval(pollInterval);
              throw new Error(task.error || 'Generation failed');
            } else {
              setExportProgress(`正在后端生成报告... ${task.progress}%`);
            }
          } catch (err) {
            console.error('Polling error:', err);
            clearInterval(pollInterval);
            setIsExporting(false);
            setExportProgress('查询进度失败');
            alert('查询进度失败');
          }
        }, 1000); // Poll every 1 second for faster feedback

      } catch (error) {
        console.error("Export failed", error);
        alert("Failed to export report: " + (error instanceof Error ? error.message : 'Unknown error'));
        setIsExporting(false);
        setExportProgress('');
      }
    }, 100);
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

      {/* Data Integrity Dashboard */}
      {importLogs.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Server className="w-5 h-5 text-gray-500" />
              <h3 className="font-semibold text-gray-900">数据导入概览</h3>
              <div className="flex gap-2">
                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  成功: {importStats.success}
                </span>
                {importStats.failed > 0 && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium flex items-center gap-1">
                    <XCircle className="w-3 h-3" />
                    失败: {importStats.failed}
                  </span>
                )}
              </div>
            </div>
            {importStats.failed > 0 && (
              <button
                onClick={() => setShowImportErrors(!showImportErrors)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                {showImportErrors ? '收起详情' : '查看异常详情'}
                {showImportErrors ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
              </button>
            )}
          </div>
          
          {showImportErrors && importStats.failed > 0 && (
            <div className="p-4 bg-red-50/50 border-b border-red-100 max-h-60 overflow-y-auto">
              <h4 className="text-sm font-semibold text-red-800 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                异常结构列表 ({importStats.failed})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {importStats.failedLogs.map((log) => (
                  <div key={`${log.id}-${log.type}`} className="bg-white p-3 rounded border border-red-100 shadow-sm text-sm">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-gray-900">{log.name || log.id}</span>
                      <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                        {log.type === '1' ? '类型1' : log.type === '2' ? '类型2' : '类型3'}
                      </span>
                    </div>
                    <div className="text-red-600 text-xs mt-1 break-words">
                      原因: {log.msg}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100 z-20">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">分析仪表盘</h2>
          <p className="text-gray-500">已加载 {processedStructures.length} 个结构物数据</p>
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

      <div className="sticky top-0 z-[100] bg-white/95 backdrop-blur shadow-sm border-b border-gray-100 transition-all duration-300 -mx-6 px-6 py-2">
        <AnalysisToolbar 
          config={analysisConfig}
          onChange={handleAnalysisConfigChange}
          availableTypes={availableTypes}
          hasAiConfig={hasAiConfig}
          onAiAnalyze={() => handleRunAiAnalysis()}
          isAiAnalyzing={Object.values(isAiLoading).some(v => v)}
          onAiStop={() => handleStopAiAnalysis()}
        />
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
             <div className="w-full lg:w-72 shrink-0 lg:sticky top-[100px] self-start max-h-[calc(100vh-8rem)] overflow-y-auto z-30">
              <SectionNavigator 
                sections={template.sections} 
                onSectionClick={(sectionId) => {
                   const el = document.getElementById(`section-${sectionId}`);
                   if (el) {
                     el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                   }
                }}
                onAddSection={handleAddSection}
                stats={{
                  totalPages,
                  totalCharts,
                  totalWords
                }}
              />
              
              {/* Quick Structure Navigation (Only visible when Chart Analysis section exists) */}
              {template.sections.some(s => s.type === 'chart_analysis') && (
                <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="p-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <h4 className="font-semibold text-gray-900 text-xs flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5 text-blue-600" />
                      结构快速导航
                    </h4>
                  </div>
                  <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                    {processedStructures.map((s, idx) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          const el = document.getElementById(`analysis-structure-${s.id}`);
                          if (el) {
                            // Expand the details element if needed
                            if (!(el as HTMLDetailsElement).open) {
                                (el as HTMLDetailsElement).open = true;
                                // Trigger state update manually since setting open directly doesn't fire toggle event in React reliably sometimes
                                setExpandedAnalysisStructureId(s.id);
                                setRenderedSensorCharts(prev => {
                                   const next = { ...prev };
                                   for (const sensor of s.sensors) {
                                     next[`${s.id}-${sensor.id}`] = true;
                                   }
                                   return next;
                                 });
                            }
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }}
                        className="w-full text-left px-3 py-1.5 rounded text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-700 transition-colors truncate flex items-center gap-2"
                      >
                        <span className="w-4 text-center text-gray-400 font-mono">{idx + 1}</span>
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center print:hidden">
                        <span className="text-sm text-gray-500">
                          {statusLastUpdated ? `上次更新: ${statusLastUpdated}` : '点击右侧按钮获取最新状态'}
                        </span>
                        <button 
                          onClick={refreshDeviceStatus}
                          disabled={isRefreshingStatus}
                          className="flex items-center gap-1.5 text-xs bg-white border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingStatus ? 'animate-spin' : ''}`} />
                          {isRefreshingStatus ? '获取中...' : '更新设备状态'}
                        </button>
                      </div>
                      
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">结构名称</th>
                              {deviceTypeColumns.map((t) => (
                                <th key={t} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t}</th>
                              ))}
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">总在线率</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">最后更新时间</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {processedStructures.length > 0 ? (
                              processedStructures.map((structure) => {
                                const device = deviceStatuses.find(d => d.id === structure.id) || null;
                                const stats = device?.stats || {};
                                const types = stats.types || {};
                                return (
                                  <tr key={structure.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{structure.name}</td>
                                    {deviceTypeColumns.map((t) => (
                                      <td key={t} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {formatRate(types?.[t]?.online, types?.[t]?.total)}
                                      </td>
                                    ))}
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                      {formatRate(stats.online, stats.total)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{device?.lastUpdate || '-'}</td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr className="opacity-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">-</td>
                                {deviceTypeColumns.map((t) => (
                                  <td key={t} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                                ))}
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      {deviceStatuses.length === 0 && (
                        <div className="bg-yellow-50 px-4 py-2 text-xs text-yellow-700 text-center border-t border-yellow-100">
                          * 当前显示为示例数据，请点击上方“更新设备状态”按钮获取实时数据
                        </div>
                      )}
                    </div>
                  )}

                  {section.type === 'chart_analysis' && (
                    <div className="space-y-12">
                      {structureGroups ? (
                        <div className="space-y-16">
                          {structureGroups.map((group) => (
                            <div key={group.name} className="space-y-8">
                              <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
                                <h3 className="text-xl font-bold text-gray-800">{group.name}</h3>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
                                  {group.structures.length} 个结构
                                </span>
                              </div>
                              <div className="space-y-12">
                                {group.structures.map((structure) => {
                                  const isExpanded = expandedAnalysisStructureId === structure.id;
                                  return (
                                    <details 
                                      key={structure.id} 
                                      id={`analysis-structure-${structure.id}`}
                                      className="group bg-white rounded-xl border border-gray-200 shadow-sm transition-all duration-300 open:pb-6 scroll-mt-[130px]"
                                      open={isExpanded}
                                    >
                                      <summary 
                                        className="sticky top-[58px] z-40 bg-white flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors list-none select-none border-b border-transparent group-open:border-gray-100 rounded-t-xl shadow-sm"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          if (!isExpanded) {
                                            setRenderedSensorCharts(prev => {
                                              const next = { ...prev };
                                              for (const sensor of structure.sensors) {
                                                next[`${structure.id}-${sensor.id}`] = true;
                                              }
                                              return next;
                                            });
                                          }
                                          setExpandedAnalysisStructureId(isExpanded ? null : structure.id);
                                        }}
                                      >
                                        <div className="flex items-center gap-3">
                                          <div className={cn("p-2 rounded-lg transition-colors", isExpanded ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500")}>
                                            <Activity className="w-5 h-5" />
                                          </div>
                                          <h4 className="text-lg font-bold text-gray-900">
                                            {structure.name}
                                          </h4>
                                          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                            {structure.sensors.length} 个测点
                                          </span>
                                        </div>
                                        
                                        <div className="flex items-center gap-3">
                                          {/* Per-structure AI Analysis Button */}
                                          {hasAiConfig && analysisConfig.enableGlobal && analysisConfig.enableAi && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleRunAiAnalysis(structure.id);
                                              }}
                                              disabled={isAiLoading[structure.id]}
                                              className={cn(
                                                "px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5",
                                                isAiLoading[structure.id]
                                                  ? "bg-purple-50 text-purple-400 cursor-wait"
                                                  : "bg-purple-50 text-purple-600 hover:bg-purple-100 hover:shadow-sm"
                                              )}
                                              title="点击运行该结构的 AI 分析"
                                            >
                                              {isAiLoading[structure.id] ? (
                                                <>
                                                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                  <span>分析中...</span>
                                                </>
                                              ) : (
                                                <>
                                                  <Brain className="w-4 h-4" />
                                                  <span>AI 分析</span>
                                                </>
                                              )}
                                            </button>
                                          )}
                                          
                                          <div className="flex items-center gap-1 text-gray-400">
                                            <span className="text-sm">{isExpanded ? '收起' : '展开'}</span>
                                            {isExpanded ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                                          </div>
                                        </div>
                                      </summary>
                                      
                                      <div className="px-6 pt-2">
                                        {/* Chart Grid */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                          {isExpanded && (
                                            structure.sensors.map((sensor) => {
                                              return (
                                                <div key={sensor.id} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                                   <SensorChart 
                                                     sensor={sensor} 
                                                     color="#2563eb" 
                                                   />
                                                </div>
                                              );
                                            })
                                          )}
                                        </div>

                                        {/* Analysis Results */}
                                        {isExpanded && analysisConfig.enableGlobal && (
                                          <AnalysisResultView 
                                            qualityResults={analysisResults[structure.id]?.quality}
                                            trendResults={analysisResults[structure.id]?.trend}
                                            deformationResults={analysisResults[structure.id]?.deformation}
                                            accelerationResults={analysisResults[structure.id]?.acceleration}
                                            crackResults={analysisResults[structure.id]?.crack}
                                            correlationResult={analysisResults[structure.id]?.correlation}
                                            aiResult={aiResults[structure.id]}
                                            config={analysisConfig}
                                            isLoadingAi={isAiLoading[structure.id]}
                                          />
                                        )}
                                      </div>
                                    </details>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        processedStructures.map((structure) => {
                          const isExpanded = expandedAnalysisStructureId === structure.id;
                          return (
                            <details 
                              key={structure.id} 
                              id={`analysis-structure-${structure.id}`}
                              className="group bg-white rounded-xl border border-gray-200 shadow-sm transition-all duration-300 open:pb-6 scroll-mt-[130px]"
                              open={isExpanded}
                            >
                              <summary 
                                className="sticky top-[58px] z-40 bg-white flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors list-none select-none border-b border-transparent group-open:border-gray-100 rounded-t-xl shadow-sm"
                                onClick={(e) => {
                                  e.preventDefault();
                                  if (!isExpanded) {
                                    setRenderedSensorCharts(prev => {
                                      const next = { ...prev };
                                      for (const sensor of structure.sensors) {
                                        next[`${structure.id}-${sensor.id}`] = true;
                                      }
                                      return next;
                                    });
                                  }
                                  setExpandedAnalysisStructureId(isExpanded ? null : structure.id);
                                }}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={cn("p-2 rounded-lg transition-colors", isExpanded ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500")}>
                                    <Activity className="w-5 h-5" />
                                  </div>
                                  <h4 className="text-lg font-bold text-gray-900">
                                    {structure.name}
                                  </h4>
                                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                    {structure.sensors.length} 个测点
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-3">
                                  {/* Per-structure AI Analysis Button */}
                                  {hasAiConfig && analysisConfig.enableGlobal && analysisConfig.enableAi && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRunAiAnalysis(structure.id);
                                      }}
                                      disabled={isAiLoading[structure.id]}
                                      className={cn(
                                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5",
                                        isAiLoading[structure.id]
                                          ? "bg-purple-50 text-purple-400 cursor-wait"
                                          : "bg-purple-50 text-purple-600 hover:bg-purple-100 hover:shadow-sm"
                                      )}
                                      title="点击运行该结构的 AI 分析"
                                    >
                                      {isAiLoading[structure.id] ? (
                                        <>
                                          <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                          <span>分析中...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Brain className="w-4 h-4" />
                                          <span>AI 分析</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                  
                                  <div className="flex items-center gap-1 text-gray-400">
                                    <span className="text-sm">{isExpanded ? '收起' : '展开'}</span>
                                    {isExpanded ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                                  </div>
                                </div>
                              </summary>
                              
                              <div className="px-6 pt-2">
                                {/* Chart Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  {isExpanded && (
                                    structure.sensors.map((sensor) => {
                                      return (
                                        <div key={sensor.id} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                           <SensorChart 
                                             sensor={sensor} 
                                             color="#2563eb" 
                                           />
                                        </div>
                                      );
                                    })
                                  )}
                                </div>

                                {/* Analysis Results */}
                                {isExpanded && analysisConfig.enableGlobal && (
                                  <AnalysisResultView 
                                    qualityResults={analysisResults[structure.id]?.quality}
                                    trendResults={analysisResults[structure.id]?.trend}
                                    deformationResults={analysisResults[structure.id]?.deformation}
                                    accelerationResults={analysisResults[structure.id]?.acceleration}
                                    crackResults={analysisResults[structure.id]?.crack}
                                    correlationResult={analysisResults[structure.id]?.correlation}
                                    aiResult={aiResults[structure.id]}
                                    config={analysisConfig}
                                    isLoadingAi={isAiLoading[structure.id]}
                                  />
                                )}
                              </div>
                            </details>
                          );
                        })
                      )}
                    </div>
                  )}

                  {section.type === 'conclusion' && (
                    <div className="bg-white rounded-lg border border-gray-200 p-6">
                      <div className="prose max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed min-h-[100px] outline-none" contentEditable onBlur={(e) => {
                        const newSections = [...template.sections];
                        const idx = newSections.findIndex(s => s.id === section.id);
                        if (idx !== -1) {
                          newSections[idx] = { ...newSections[idx], content: e.currentTarget.innerText };
                          setTemplate({ ...template, sections: newSections });
                        }
                      }}>
                        {section.content || '在此处输入评估结论及建议...'}
                      </div>
                      
                      {/* AI Summary Button for Conclusion */}
                      {hasAiConfig && analysisConfig.enableGlobal && analysisConfig.enableAi && (
                        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
                           <button
                            onClick={async () => {
                              const config = localStorage.getItem('ai_config');
                              if (!config) return;
                              const { baseUrl, apiKey, model } = JSON.parse(config);
                              
                              const btn = document.getElementById(`ai-btn-${section.id}`);
                              if (btn) btn.innerText = 'AI 生成中...';
                              
                              try {
                                const { generateOverallSummaryPrompt, callAiApi } = await import('../utils/analysis');
                                const prompt = generateOverallSummaryPrompt(structures);
                                const result = await callAiApi(prompt, { baseUrl, apiKey, model });
                                
                                const newSections = [...template.sections];
                                const idx = newSections.findIndex(s => s.id === section.id);
                                if (idx !== -1) {
                                  const currentContent = newSections[idx].content || '';
                                  newSections[idx] = { 
                                    ...newSections[idx], 
                                    content: currentContent ? `${currentContent}\n\n【AI 智能总结】\n${result}` : `【AI 智能总结】\n${result}` 
                                  };
                                  setTemplate({ ...template, sections: newSections });
                                }
                              } catch (err) {
                                console.error(err);
                                alert('AI 生成失败: ' + (err instanceof Error ? err.message : '未知错误'));
                              } finally {
                                if (btn) btn.innerText = 'AI 智能生成总结';
                              }
                            }}
                            id={`ai-btn-${section.id}`}
                            className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg text-sm font-medium transition-colors"
                          >
                            <Sparkles className="w-4 h-4" />
                            AI 智能生成总结
                          </button>
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
