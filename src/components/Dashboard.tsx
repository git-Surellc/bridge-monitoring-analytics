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
import { AnalysisConfig, analyzeStructure, analyzeWithAI, StructureAnalysisResult, getSensorType, generateAiPrompt, sortStructuresByUserOrder, groupStructures, StructureGroup, denoiseData } from '../utils/analysis';

const getStructureKey = (structure: StructureData) => `${structure.id}-${structure.type || '1'}`;

const fnv1a = (input: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
};

const getSensorDataFingerprint = (data: any) => {
  if (!Array.isArray(data) || data.length === 0) return 'empty';
  const first = data[0];
  const last = data[data.length - 1];
  const raw = `${data.length}|${String(first?.time ?? '')}|${String(last?.time ?? '')}|${String(first?.value ?? '')}|${String(last?.value ?? '')}`;
  return fnv1a(raw);
};

const buildChartCacheKey = (structure: StructureData, sensorId: string, data: any) => {
  const structureKey = getStructureKey(structure);
  const structureName = String(structure.name || '');
  const fp = getSensorDataFingerprint(data);
  return `chart:v1:${structureKey}:${structureName}:${sensorId}:${fp}`;
};

const downsampleSeries = (data: any, maxPoints: number) => {
  if (!Array.isArray(data)) return [];
  const n = data.length;
  if (n <= maxPoints) {
    return data.map((d: any) => ({ time: d?.time, value: d?.value }));
  }
  const step = Math.ceil(n / maxPoints);
  const sampled: Array<{ time: any; value: any }> = [];
  for (let i = 0; i < n; i += step) {
    const d = data[i];
    sampled.push({ time: d?.time, value: d?.value });
  }
  const last = data[n - 1];
  const lastPoint = { time: last?.time, value: last?.value };
  const lastSampled = sampled[sampled.length - 1];
  if (!lastSampled || lastSampled.time !== lastPoint.time || lastSampled.value !== lastPoint.value) {
    sampled.push(lastPoint);
  }
  return sampled;
};

const compactStructureForExport = (structure: any, maxPointsPerSensor: number) => {
  const sensors = Array.isArray(structure?.sensors) ? structure.sensors : [];
  const compactSensors = sensors.map((sensor: any) => ({
    id: sensor?.id,
    name: sensor?.name,
    unit: sensor?.unit,
    deviceType: sensor?.deviceType,
    sheetType: sensor?.sheetType,
    sensorType: sensor?.sensorType,
    alarmThreshold: sensor?.alarmThreshold,
    data: downsampleSeries(sensor?.data, maxPointsPerSensor),
    stats: sensor?.stats,
  }));
  return { ...structure, sensors: compactSensors };
};

const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit | undefined, timeoutMs: number) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...(init || {}), signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

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

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string>('');
  const [reportCover, setReportCover] = useState<ReportCover>({} as ReportCover);
  const [template, setTemplate] = useState<ReportTemplate>(DEFAULT_TEMPLATE);
  const [showTemplateEditor, setShowTemplateEditor] = useState(true);
  const [activeArea, setActiveArea] = useState<'editor' | 'preview'>('editor');
  const [showImportErrors, setShowImportErrors] = useState(true);
  const [expandedAnalysisStructureKey, setExpandedAnalysisStructureKey] = useState<string | null>(null);
  const [renderedSensorCharts, setRenderedSensorCharts] = useState<Record<string, boolean>>({});
  
  // Device Status State
  const [deviceStatuses, setDeviceStatuses] = useState<any[]>([]);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [statusLastUpdated, setStatusLastUpdated] = useState<string | null>(null);

  // Analysis State
  const [analysisConfig, setAnalysisConfig] = useState<AnalysisConfig>(() => {
    const saved = localStorage.getItem('analysis_config');
    return saved ? JSON.parse(saved) : {
      enableGlobal: true,
      enableAi: false,
      enableInclination: true,
      enableDisplacement: true,
      enableAcceleration: true,
      enableTemperature: true,
      enableCrack: true,
      enableCorrelation: true,
      enableDenoise: false
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
  const [denoiseStructures, setDenoiseStructures] = useState<Record<string, boolean>>({});
  const [denoiseSensors, setDenoiseSensors] = useState<Record<string, boolean>>({});
  const [denoiseRules, setDenoiseRules] = useState<Record<string, { maxDelta?: number | null; min?: number | null; max?: number | null }>>(() => {
    const saved = localStorage.getItem('denoise_rules_v2');
    return saved ? JSON.parse(saved) : {};
  });
  const [showDenoiseConfig, setShowDenoiseConfig] = useState(false);
  const [deviceMetaRules, setDeviceMetaRules] = useState<Record<string, { sensorType?: string | null; unit?: string | null; alarmThreshold?: number | null; maxDelta?: number | null; min?: number | null; max?: number | null }>>(() => {
    const saved = localStorage.getItem('device_meta_rules_v1');
    return saved ? JSON.parse(saved) : {};
  });
  const [showDeviceMetaConfig, setShowDeviceMetaConfig] = useState(false);
  const [indicatorSelection, setIndicatorSelection] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('indicator_selection_v1');
    return saved ? JSON.parse(saved) : {};
  });
  const [showIndicatorSelect, setShowIndicatorSelect] = useState(false);
  const backendOriginRef = useRef<string | null>(null);

  const allDeviceTypes = React.useMemo(() => {
    const set = new Set<string>();
    for (const s of processedStructures) {
      for (const sensor of (s.sensors || [])) {
        const key = String(sensor.deviceType || sensor.sheetType || '').trim();
        if (key) set.add(key);
      }
    }
    return set;
  }, [processedStructures]);

  useEffect(() => {
    try {
      const v = (localStorage.getItem('backend_origin') || '').trim();
      backendOriginRef.current = v || null;
    } catch {
      backendOriginRef.current = null;
    }
  }, []);

  const guessBackendOrigin = () => `${window.location.protocol}//${window.location.hostname}:8008`;

  const resolveBackendUrl = (url: string) => {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url;
    if (!url.startsWith('/')) return url;
    const origin = backendOriginRef.current;
    if (!origin) return url;
    return origin.replace(/\/$/, '') + url;
  };

  const smartFetch = async (url: string, init: RequestInit | undefined, timeoutMs: number) => {
    try {
      return await fetchWithTimeout(resolveBackendUrl(url), init, timeoutMs);
    } catch (err) {
      if (!url.startsWith('/api') && !url.startsWith('/storage')) throw err;
      if (backendOriginRef.current) throw err;
      const guess = guessBackendOrigin();
      const res = await fetchWithTimeout(guess.replace(/\/$/, '') + url, init, timeoutMs);
      backendOriginRef.current = guess;
      try {
        localStorage.setItem('backend_origin', guess);
      } catch {}
      return res;
    }
  };

  const DEVICE_PRESETS = React.useMemo(() => {
    return {
      '一体化倾角振动监测仪': { sensorType: 'inclination', unit: '°' },
      '光电挠度仪': { sensorType: 'displacement', unit: 'mm' },
      '拉线位移传感器': { sensorType: 'displacement', unit: 'mm' },
      '盒式固定测斜仪': { sensorType: 'inclination', unit: '°' },
      '一体化振动监测仪': { sensorType: 'acceleration', unit: 'mg' },
      '裂缝计': { sensorType: 'crack', unit: 'mm' },
      '激光测距仪': { sensorType: 'displacement', unit: 'mm' },
    } as Record<string, { sensorType: string; unit: string }>;
  }, []);

  const allDeviceTypeList = React.useMemo(() => {
    const set = new Set<string>(Array.from(allDeviceTypes));
    Object.keys(DEVICE_PRESETS).forEach((k) => set.add(k));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }, [allDeviceTypes, DEVICE_PRESETS]);

  const allSheetNameList = React.useMemo(() => {
    const set = new Set<string>();
    for (const s of processedStructures) {
      for (const sensor of (s.sensors || [])) {
        const sheet = String(sensor.sheetType || '').trim();
        if (sheet) set.add(sheet);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }, [processedStructures]);

  const displayStructures = React.useMemo(() => {
    return processedStructures.map((structure) => ({
      ...structure,
      sensors: (structure.sensors || []).map((sensor) => {
        const key = String(sensor.deviceType || sensor.sheetType || '').trim();
        const meta = key ? deviceMetaRules[key] : undefined;
        const unit = meta?.unit && String(meta.unit).trim() ? String(meta.unit).trim() : sensor.unit;
        const sensorType = meta?.sensorType && String(meta.sensorType).trim() ? String(meta.sensorType).trim() : sensor.sensorType;
        const alarmThreshold = meta?.alarmThreshold;
        return {
          ...sensor,
          unit,
          sensorType,
          alarmThreshold: typeof alarmThreshold === 'number' && Number.isFinite(alarmThreshold) ? alarmThreshold : sensor.alarmThreshold
        };
      })
    }));
  }, [processedStructures, deviceMetaRules]);

  const selectedStructures = React.useMemo(() => {
    return displayStructures
      .map((structure) => ({
        ...structure,
        sensors: (structure.sensors || []).filter((sensor) => {
          const sheet = String(sensor.sheetType || '').trim();
          if (!sheet) return true;
          return indicatorSelection[sheet] !== false;
        }),
      }))
      .filter((s) => (s.sensors || []).length > 0);
  }, [displayStructures, indicatorSelection]);

  const displayStructureGroups = React.useMemo(() => {
    if (!customGroups || !customGroups.trim()) return null;
    return groupStructures(selectedStructures, customGroups);
  }, [selectedStructures, customGroups]);

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
    if (expandedAnalysisStructureKey && !structures.some(s => getStructureKey(s) === expandedAnalysisStructureKey)) {
      setExpandedAnalysisStructureKey(null);
    }
  }, [structures]);

  // Sync Analysis Config with LocalStorage
  useEffect(() => {
    localStorage.setItem('analysis_config', JSON.stringify(analysisConfig));
  }, [analysisConfig]);

  useEffect(() => {
    localStorage.setItem('denoise_rules_v2', JSON.stringify(denoiseRules));
  }, [denoiseRules]);

  useEffect(() => {
    localStorage.setItem('device_meta_rules_v1', JSON.stringify(deviceMetaRules));
  }, [deviceMetaRules]);

  useEffect(() => {
    localStorage.setItem('indicator_selection_v1', JSON.stringify(indicatorSelection));
  }, [indicatorSelection]);

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
    selectedStructures.forEach(structure => {
      const key = getStructureKey(structure);
      const sensors = structure.sensors.map(sensor => {
        const displaySensor = getDisplaySensor(key, sensor);
        return displaySensor;
      });
      const displayStructure = { ...structure, sensors };
      const result = analyzeStructure(displayStructure, analysisConfig);
      if (result) {
        newResults[key] = result;
      }
    });
    setAnalysisResults(newResults);
  }, [selectedStructures, analysisConfig, denoiseStructures, denoiseSensors, denoiseRules, deviceMetaRules]);

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

  const handleRunAiAnalysis = async (structureKey?: string) => {
    if (!analysisConfig.enableGlobal || !analysisConfig.enableAi || !hasAiConfig) return;
    
    const savedConfig = localStorage.getItem('ai_config');
    if (!savedConfig) {
      alert('请先配置 AI 接口信息');
      return;
    }
    const aiConfig = JSON.parse(savedConfig);

    const targetStructures = structureKey 
      ? selectedStructures.filter(s => getStructureKey(s) === structureKey)
      : selectedStructures;

    if (targetStructures.length === 0) return;

    // Check if already running (simple check)
    if (aiBatchId) {
      const confirm = window.confirm('已有正在进行的 AI 分析任务，是否重新开始？');
      if (!confirm) return;
    }

    // Set loading state
    const loadingState: Record<string, boolean> = {};
    targetStructures.forEach(s => loadingState[getStructureKey(s)] = true);
    setIsAiLoading(prev => ({ ...prev, ...loadingState }));

    try {
      const tasks = targetStructures.reduce((acc, s) => {
        const key = getStructureKey(s);
        const analysis = analysisResults[key] || analyzeStructure(s, analysisConfig);
        if (!analysis) return acc;
        acc.push({
          id: key,
          name: s.name,
          prompt: generateAiPrompt(s, analysis),
        });
        return acc;
      }, [] as Array<{ id: string; name: string; prompt: string }>);

      if (tasks.length === 0) {
        alert('没有可用于 AI 分析的结构数据');
        setIsAiLoading(prev => {
          const next = { ...prev };
          targetStructures.forEach(s => delete next[getStructureKey(s)]);
          return next;
        });
        return;
      }

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
        targetStructures.forEach(s => delete next[getStructureKey(s)]);
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
    const targetStructure = selectedStructures.find(s => getStructureKey(s) === expandedAnalysisStructureKey);
    // If a structure is expanded, show its types. Otherwise show all types.
    const source = targetStructure ? [targetStructure] : selectedStructures;
    
    source.forEach(s => {
      s.sensors.forEach(sensor => {
        const type = getSensorType(sensor);
        if (type) types.add(type);
      });
    });
    return types;
  }, [selectedStructures, expandedAnalysisStructureKey]);

  const allAvailableTypes = React.useMemo(() => {
    const types = new Set<string>();
    selectedStructures.forEach(s => {
      s.sensors.forEach(sensor => {
        const type = getSensorType(sensor);
        if (type) types.add(type);
      });
    });
    return types;
  }, [selectedStructures]);

  const getTypeMeta = (type: string) => {
    const map: Record<string, { label: string; unit: string }> = {
      inclination: { label: '倾角', unit: '°' },
      displacement: { label: '位移', unit: 'mm' },
      acceleration: { label: '加速度', unit: 'm/s²' },
      temperature: { label: '温度', unit: '℃' },
      crack: { label: '裂缝', unit: 'mm' },
    };
    return map[type] || { label: '其他', unit: '' };
  };

  const getDenoiseRule = (sensor: any) => {
    const type = getSensorType(sensor) || 'other';
    const deviceKey = String(sensor.deviceType || sensor.sheetType || '').trim();
    const deviceRule = deviceKey ? deviceMetaRules[deviceKey] : undefined;
    const maxDeltaSource = deviceRule?.maxDelta !== undefined ? deviceRule : (denoiseRules[type] || {});
    const minSource = deviceRule?.min !== undefined ? deviceRule : (denoiseRules[type] || {});
    const maxSource = deviceRule?.max !== undefined ? deviceRule : (denoiseRules[type] || {});

    const maxDelta = typeof maxDeltaSource.maxDelta === 'number' && Number.isFinite(maxDeltaSource.maxDelta) && maxDeltaSource.maxDelta > 0 ? maxDeltaSource.maxDelta : undefined;
    const min = typeof minSource.min === 'number' && Number.isFinite(minSource.min) ? minSource.min : undefined;
    const max = typeof maxSource.max === 'number' && Number.isFinite(maxSource.max) ? maxSource.max : undefined;
    return { type, maxDelta, min, max };
  };

  const getDisplaySensor = (structureKey: string, sensor: any) => {
    if (!analysisConfig.enableDenoise) return sensor;
    const shouldDenoiseStructure = denoiseStructures[structureKey] ?? true;
    const sensorKey = `${structureKey}-${sensor.id}`;
    const shouldDenoiseSensor = denoiseSensors[sensorKey] ?? false;
    const applyDenoise = shouldDenoiseSensor || shouldDenoiseStructure;
    if (!applyDenoise) return sensor;
    const rule = getDenoiseRule(sensor);
    return { ...sensor, data: denoiseData(sensor.data, { maxDelta: rule.maxDelta, min: rule.min, max: rule.max }) };
  };

  const getDisplayStructure = (structure: any) => {
    const key = getStructureKey(structure);
    return { ...structure, sensors: structure.sensors.map((sensor: any) => getDisplaySensor(key, sensor)) };
  };

  const handleAnalysisConfigChange = (key: keyof AnalysisConfig, value: boolean) => {
    if (key === 'enableDenoise' && value) {
      setDenoiseStructures(prev => {
        const next = { ...prev };
        for (const s of selectedStructures) {
          const k = getStructureKey(s);
          if (next[k] === undefined) next[k] = true;
        }
        return next;
      });
    }
    setAnalysisConfig(prev => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (!analysisConfig.enableDenoise) return;
    setDenoiseStructures(prev => {
      const next = { ...prev };
      let changed = false;
      for (const s of selectedStructures) {
        const k = getStructureKey(s);
        if (next[k] === undefined) {
          next[k] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [analysisConfig.enableDenoise, selectedStructures]);

  useEffect(() => {
    localStorage.setItem('denoise_rules_v2', JSON.stringify(denoiseRules));
  }, [denoiseRules]);

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

      const res = await smartFetch('/api/devices/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structures: structureList }),
        signal: controller.signal
      }, 15000);
      
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
  const totalCharts = selectedStructures.reduce((acc, structure) => acc + structure.sensors.length, 0);
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
    const percent = (((online || 0) / total) * 100);
    return `${percent.toFixed(3)}% (${online || 0}/${total})`;
  };

  const formatSensorTitleForPreview = (sensor: any) => {
    const deviceName = String(sensor?.sheetType || sensor?.deviceType || '').trim();
    const rawName = String(sensor?.name || '').trim();
    if (!deviceName && !rawName) return '';

    let location = rawName;
    let inner = '';
    const match = rawName.match(/^(.*)[(（](.*)[)）]$/);
    if (match) {
      location = match[1].trim();
      inner = match[2].trim();
    }

    const directionMatch = inner.match(/[XYZ]/i);
    const direction = directionMatch ? directionMatch[0].toUpperCase() : '';
    const bracket = [location, direction].filter(Boolean).join(' ');

    if (deviceName && bracket) return `${deviceName}（${bracket}）`;
    if (deviceName) return deviceName;
    return bracket || rawName;
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
    if (selectedStructures.length === 0) {
      alert('请先在“指标选择”中至少选择一个设备');
      return;
    }
    
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
        const maxPointsPerSensor = 1200;
        const bridgesWithAi = selectedStructures.map(s => {
          const key = getStructureKey(s);
          const displayStructure = getDisplayStructure(s);
          return {
            ...compactStructureForExport(displayStructure, maxPointsPerSensor),
            aiAnalysis: aiResults[key] || null,
            analysis: analysisResults[key] || null
          };
        });

        // Prepare groups if they exist
        let exportGroups = null;
        if (displayStructureGroups) {
          exportGroups = displayStructureGroups.map(g => ({
            name: g.name,
            structures: g.structures.map(s => {
              const key = getStructureKey(s);
              const displayStructure = getDisplayStructure(s);
              return {
                ...compactStructureForExport(displayStructure, maxPointsPerSensor),
                aiAnalysis: aiResults[key] || null,
                analysis: analysisResults[key] || null
              };
            })
          }));
        }

        const response = await smartFetch('/api/reports/generate', {
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
        }, 60000);


        if (!response.ok) {
          let detail = '';
          try {
            detail = await response.text();
          } catch {}
          throw new Error(`Failed to start task: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`);
        }

        const { taskId } = await response.json();
        
        // 2. Poll for status
        let done = false;
        let inFlight = false;
        const pollInterval = setInterval(async () => {
          if (done || inFlight) return;
          inFlight = true;
          try {
            const statusRes = await smartFetch(`/api/reports/task/${taskId}`, undefined, 8000);
            if (!statusRes.ok) return;
            
            const task = await statusRes.json();
            
            if (task.status === 'completed') {
              done = true;
              clearInterval(pollInterval);
              setExportProgress('下载中...');
              
              const link = document.createElement('a');
              link.href = resolveBackendUrl(task.downloadUrl);
              link.download = task.fileName;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              
              setIsExporting(false);
              setExportProgress('');
            } else if (task.status === 'failed') {
              done = true;
              clearInterval(pollInterval);
              throw new Error(task.error || 'Generation failed');
            } else {
              setExportProgress(`正在后端生成报告... ${task.progress}%`);
            }
          } catch (err) {
            done = true;
            console.error('Polling error:', err);
            clearInterval(pollInterval);
            setIsExporting(false);
            setExportProgress('查询进度失败');
            alert('查询进度失败');
          } finally {
            inFlight = false;
          }
        }, 1000);

      } catch (error) {
        console.error("Export failed", error);
        const msg = error instanceof Error ? error.message : 'Unknown error';
        if (msg.includes('Failed to fetch') || msg.includes('ERR_CONNECTION_RESET') || msg.includes('abort')) {
          alert('导出失败：后端接口连接异常（常见原因：7100 未正确反代 /api，或后端服务未运行/被重启）。');
        } else {
          alert("Failed to export report: " + msg);
        }
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
          <p className="text-gray-500">已加载 {displayStructures.length} 个结构物数据</p>
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
          onOpenDenoiseConfig={() => setShowDenoiseConfig(true)}
          onOpenDeviceMetaConfig={() => setShowDeviceMetaConfig(true)}
          onOpenIndicatorSelect={() => setShowIndicatorSelect(true)}
        />
      </div>

      {showIndicatorSelect && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40"
          onMouseDown={() => setShowIndicatorSelect(false)}
        >
          <div
            className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-base font-semibold text-gray-900">指标选择</div>
                <div className="text-xs text-gray-500">取消勾选后，该设备数据不会参与分析与导出</div>
              </div>
              <button
                onClick={() => setShowIndicatorSelect(false)}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                关闭
              </button>
            </div>

            <div className="px-6 py-4">
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => {
                    const next: Record<string, boolean> = {};
                    allSheetNameList.forEach((k) => (next[k] = true));
                    setIndicatorSelection(next);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors"
                >
                  全选
                </button>
                <button
                  onClick={() => {
                    const next: Record<string, boolean> = {};
                    allSheetNameList.forEach((k) => (next[k] = false));
                    setIndicatorSelection(next);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors"
                >
                  全不选
                </button>
                <button
                  onClick={() => setIndicatorSelection({})}
                  className="ml-auto px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                >
                  恢复默认
                </button>
              </div>

              <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-gray-200">
                <div className="divide-y divide-gray-100">
                  {allSheetNameList.map((sheet) => {
                    const checked = indicatorSelection[sheet] !== false;
                    return (
                      <label key={sheet} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          checked={checked}
                          onChange={(e) => setIndicatorSelection((prev) => ({ ...prev, [sheet]: e.target.checked }))}
                        />
                        <span className="text-sm text-gray-900">{sheet}</span>
                      </label>
                    );
                  })}
                  {allSheetNameList.length === 0 && (
                    <div className="px-4 py-6 text-sm text-gray-500 text-center">暂无可选择的设备</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDenoiseConfig && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40"
          onMouseDown={() => setShowDenoiseConfig(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-base font-semibold text-gray-900">去噪配置</div>
                <div className="text-xs text-gray-500">按指标类型设置：最大变化量 + 上下限（超出即剔除）</div>
              </div>
              <button
                onClick={() => setShowDenoiseConfig(false)}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                关闭
              </button>
            </div>

            <div className="px-6 py-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from(allAvailableTypes).sort().map((type: string) => {
                  const meta = getTypeMeta(type);
                  const rule = denoiseRules[type] || {};
                  const maxDeltaValue = rule.maxDelta ?? '';
                  const minValue = rule.min ?? '';
                  const maxValue = rule.max ?? '';
                  return (
                    <div key={type} className="rounded-xl border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{meta.label}</div>
                          <div className="text-xs text-gray-500">{meta.unit ? `单位：${meta.unit}` : '单位：-'}</div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <div className="text-xs text-gray-600 mb-1">最大变化量</div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={maxDeltaValue}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setDenoiseRules(prev => ({
                                  ...prev,
                                  [type]: { ...(prev[type] || {}), maxDelta: raw === '' ? null : Number(raw) }
                                }));
                              }}
                              className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-green-400 focus:ring-green-200"
                              placeholder={meta.unit ? `例如：5 ${meta.unit}` : '例如：5'}
                            />
                            <div className="text-xs text-gray-500 shrink-0 whitespace-nowrap min-w-[3.5rem] text-right">{meta.unit || ''}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs text-gray-600 mb-1">下限</div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                step={0.1}
                                value={minValue}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setDenoiseRules(prev => ({
                                    ...prev,
                                    [type]: { ...(prev[type] || {}), min: raw === '' ? null : Number(raw) }
                                  }));
                                }}
                                className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-green-400 focus:ring-green-200"
                                placeholder="-"
                              />
                              <div className="text-xs text-gray-500 shrink-0 whitespace-nowrap min-w-[3.5rem] text-right">{meta.unit || ''}</div>
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-600 mb-1">上限</div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                step={0.1}
                                value={maxValue}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setDenoiseRules(prev => ({
                                    ...prev,
                                    [type]: { ...(prev[type] || {}), max: raw === '' ? null : Number(raw) }
                                  }));
                                }}
                                className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-green-400 focus:ring-green-200"
                                placeholder="-"
                              />
                              <div className="text-xs text-gray-500 shrink-0 whitespace-nowrap min-w-[3.5rem] text-right">{meta.unit || ''}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {allAvailableTypes.size === 0 && (
                <div className="text-sm text-gray-600">未识别到指标类型</div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  const defaults: Record<string, { maxDelta?: number | null; min?: number | null; max?: number | null }> = {};
                  allAvailableTypes.forEach((t) => (defaults[t] = { maxDelta: null, min: null, max: null }));
                  setDenoiseRules(prev => ({ ...defaults, ...prev }));
                }}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                填充空配置
              </button>
              <button
                onClick={() => setShowDenoiseConfig(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeviceMetaConfig && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40"
          onMouseDown={() => setShowDeviceMetaConfig(false)}
        >
          <div
            className="w-full max-w-5xl bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-base font-semibold text-gray-900">设备/单位设置</div>
                <div className="text-xs text-gray-500">按设备类型设置：传感器类型、单位、报警阈值、去噪规则</div>
              </div>
              <button
                onClick={() => setShowDeviceMetaConfig(false)}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                关闭
              </button>
            </div>

            <div className="px-6 py-5 max-h-[70vh] overflow-auto">
              <div className="grid grid-cols-1 gap-4">
                {allDeviceTypeList.map((deviceType) => {
                  const rule = deviceMetaRules[deviceType] || {};
                  const unitValue = rule.unit ?? '';
                  const sensorTypeValue = rule.sensorType ?? '';
                  const alarmThresholdValue = rule.alarmThreshold ?? '';
                  const maxDeltaValue = rule.maxDelta ?? '';
                  const minValue = rule.min ?? '';
                  const maxValue = rule.max ?? '';

                  return (
                    <div key={deviceType} className="rounded-xl border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 break-words">{deviceType}</div>
                          <div className="text-xs text-gray-500">来源：设备类型 / Excel sheet</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                        <div className="lg:col-span-3">
                          <div className="text-xs text-gray-600 mb-1">传感器类型</div>
                          <select
                            value={sensorTypeValue}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setDeviceMetaRules(prev => ({
                                ...prev,
                                [deviceType]: { ...(prev[deviceType] || {}), sensorType: raw ? raw : null }
                              }));
                            }}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:border-blue-400 focus:ring-blue-200"
                          >
                            <option value="">不指定</option>
                            <option value="inclination">倾角</option>
                            <option value="displacement">位移/挠度</option>
                            <option value="acceleration">振动/加速度</option>
                            <option value="temperature">温度</option>
                            <option value="crack">裂缝</option>
                            <option value="other">其他</option>
                          </select>
                        </div>

                        <div className="lg:col-span-2">
                          <div className="text-xs text-gray-600 mb-1">单位</div>
                          <input
                            value={unitValue}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setDeviceMetaRules(prev => ({
                                ...prev,
                                [deviceType]: { ...(prev[deviceType] || {}), unit: raw.trim() ? raw : null }
                              }));
                            }}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-blue-200"
                            placeholder="例如：mm"
                          />
                        </div>

                        <div className="lg:col-span-2">
                          <div className="text-xs text-gray-600 mb-1">报警阈值</div>
                          <input
                            type="number"
                            step={0.1}
                            value={alarmThresholdValue}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setDeviceMetaRules(prev => ({
                                ...prev,
                                [deviceType]: { ...(prev[deviceType] || {}), alarmThreshold: raw === '' ? null : Number(raw) }
                              }));
                            }}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-blue-200"
                            placeholder="-"
                          />
                        </div>

                        <div className="lg:col-span-5">
                          <div className="text-xs text-gray-600 mb-1">去噪规则</div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={maxDeltaValue}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setDeviceMetaRules(prev => ({
                                    ...prev,
                                    [deviceType]: { ...(prev[deviceType] || {}), maxDelta: raw === '' ? null : Number(raw) }
                                  }));
                                }}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-blue-200"
                                placeholder="最大变化量"
                              />
                            </div>
                            <div>
                              <input
                                type="number"
                                step={0.1}
                                value={minValue}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setDeviceMetaRules(prev => ({
                                    ...prev,
                                    [deviceType]: { ...(prev[deviceType] || {}), min: raw === '' ? null : Number(raw) }
                                  }));
                                }}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-blue-200"
                                placeholder="下限"
                              />
                            </div>
                            <div>
                              <input
                                type="number"
                                step={0.1}
                                value={maxValue}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setDeviceMetaRules(prev => ({
                                    ...prev,
                                    [deviceType]: { ...(prev[deviceType] || {}), max: raw === '' ? null : Number(raw) }
                                  }));
                                }}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-blue-200"
                                placeholder="上限"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {allDeviceTypeList.length === 0 && (
                  <div className="text-sm text-gray-600">未识别到设备类型</div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setDeviceMetaRules(prev => {
                    const next = { ...prev };
                    for (const k of Object.keys(DEVICE_PRESETS)) {
                      const preset = DEVICE_PRESETS[k];
                      const cur = next[k] || {};
                      const curType = typeof cur.sensorType === 'string' ? cur.sensorType.trim() : '';
                      const curUnit = typeof cur.unit === 'string' ? cur.unit.trim() : '';
                      next[k] = {
                        ...cur,
                        sensorType: curType ? curType : preset.sensorType,
                        unit: curUnit ? curUnit : preset.unit
                      };
                    }
                    return next;
                  });
                }}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                预设已知设备
              </button>
              <button
                onClick={() => {
                  const defaults: Record<string, { sensorType?: string | null; unit?: string | null; alarmThreshold?: number | null; maxDelta?: number | null; min?: number | null; max?: number | null }> = {};
                  allDeviceTypeList.forEach((t) => (defaults[t] = {}));
                  setDeviceMetaRules(prev => ({ ...defaults, ...prev }));
                }}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                填充空配置
              </button>
              <button
                onClick={() => setShowDeviceMetaConfig(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

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
          <div className="flex gap-8 items-start">
            <div className="w-72 shrink-0 sticky top-[100px] self-start max-h-[calc(100vh-8rem)] overflow-y-auto z-30 hidden xl:block">
              {template.sections.some(s => s.type === 'chart_analysis') && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="p-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <h4 className="font-semibold text-gray-900 text-xs flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5 text-blue-600" />
                      结构快速导航
                    </h4>
                  </div>
                  <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                    {displayStructureGroups ? (
                      displayStructureGroups.map((group) => (
                        <div key={group.name} className="space-y-1 mb-2">
                          <div className="px-2 py-1 text-xs font-bold text-gray-500 bg-gray-50 rounded">
                            {group.name}
                          </div>
                          {group.structures.map((s, idx) => (
                            <button
                              key={getStructureKey(s)}
                              onClick={() => {
                                const structureKey = getStructureKey(s);
                                const el = document.getElementById(`analysis-structure-${structureKey}`);
                                if (el) {
                                  if (!(el as HTMLDetailsElement).open) {
                                    (el as HTMLDetailsElement).open = true;
                                    setExpandedAnalysisStructureKey(structureKey);
                                    setRenderedSensorCharts(prev => {
                                      const next = { ...prev };
                                      for (const sensor of s.sensors) {
                                        next[`${structureKey}-${sensor.id}`] = true;
                                      }
                                      return next;
                                    });
                                  }
                                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                              }}
                              className="w-full text-left px-3 py-1.5 rounded text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-700 transition-colors truncate flex items-center gap-2 pl-4"
                            >
                              <span className="w-10 text-center text-gray-400 font-mono">（{idx + 1}）</span>
                              {s.name}
                            </button>
                          ))}
                        </div>
                      ))
                    ) : (
                      selectedStructures.map((s, idx) => (
                        <button
                          key={getStructureKey(s)}
                          onClick={() => {
                            const structureKey = getStructureKey(s);
                            const el = document.getElementById(`analysis-structure-${structureKey}`);
                            if (el) {
                              if (!(el as HTMLDetailsElement).open) {
                                (el as HTMLDetailsElement).open = true;
                                setExpandedAnalysisStructureKey(structureKey);
                                setRenderedSensorCharts(prev => {
                                  const next = { ...prev };
                                  for (const sensor of s.sensors) {
                                    next[`${structureKey}-${sensor.id}`] = true;
                                  }
                                  return next;
                                });
                              }
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                          }}
                          className="w-full text-left px-3 py-1.5 rounded text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-700 transition-colors truncate flex items-center gap-2"
                        >
                          <span className="w-10 text-center text-gray-400 font-mono">（{idx + 1}）</span>
                          {s.name}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div ref={reportRef} className="bg-white p-8 rounded-xl border border-gray-100 min-h-screen shadow-sm print:p-0 print:shadow-none print:border-none flex-1">
            
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
                            {displayStructures.length > 0 ? (
                              displayStructures.map((structure) => {
                                const device = deviceStatuses.find(d => d.id === structure.id && (d.type || '1') === (structure.type || '1')) || null;
                                const stats = device?.stats || {};
                                const types = stats.types || {};
                                return (
                                  <tr key={getStructureKey(structure)}>
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
                      {displayStructureGroups ? (
                        <div className="space-y-16">
                          {displayStructureGroups.map((group) => (
                            <div key={group.name} className="space-y-8">
                              <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
                                <h3 className="text-xl font-bold text-gray-800">{group.name}</h3>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
                                  {group.structures.length} 个结构
                                </span>
                              </div>
                              <div className="space-y-12">
                                {group.structures.map((structure, structureIdx) => {
                                  const structureKey = getStructureKey(structure);
                                  const isExpanded = expandedAnalysisStructureKey === structureKey;
                                  const displayStructureName = `（${structureIdx + 1}）${structure.name}`;
                                  return (
                                    <details 
                                      key={structureKey} 
                                      id={`analysis-structure-${structureKey}`}
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
                                                next[`${structureKey}-${sensor.id}`] = true;
                                              }
                                              return next;
                                            });
                                          }
                                          setExpandedAnalysisStructureKey(isExpanded ? null : structureKey);
                                        }}
                                      >
                                        <div className="flex items-center gap-3">
                                          <div className={cn("p-2 rounded-lg transition-colors", isExpanded ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500")}>
                                            <Activity className="w-5 h-5" />
                                          </div>
                                          <h4 className="text-lg font-bold text-gray-900">
                                            {displayStructureName}
                                          </h4>
                                          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                            {structure.sensors.length} 个测点
                                          </span>
                                        </div>
                                        
                                        <div className="flex items-center gap-3">
                                          <label className="flex items-center gap-2 cursor-pointer select-none group" onClick={(e) => e.stopPropagation()}>
                                            <input 
                                              type="checkbox" 
                                              className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                                              checked={!!denoiseStructures[structureKey]}
                                              onChange={(e) => {
                                                const checked = e.target.checked;
                                                setDenoiseStructures(prev => ({ ...prev, [structureKey]: checked }));
                                              }}
                                            />
                                            <span className="text-sm text-gray-700 group-hover:text-green-700">该结构去噪</span>
                                          </label>
                                          {/* Per-structure AI Analysis Button */}
                                          {hasAiConfig && analysisConfig.enableGlobal && analysisConfig.enableAi && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleRunAiAnalysis(structureKey);
                                              }}
                                              disabled={isAiLoading[structureKey]}
                                              className={cn(
                                                "px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5",
                                                isAiLoading[structureKey]
                                                  ? "bg-purple-50 text-purple-400 cursor-wait"
                                                  : "bg-purple-50 text-purple-600 hover:bg-purple-100 hover:shadow-sm"
                                              )}
                                              title="点击运行该结构的 AI 分析"
                                            >
                                              {isAiLoading[structureKey] ? (
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
                                            structure.sensors.map((sensor, sensorIdx) => {
                                          const sensorKey = `${structureKey}-${sensor.id}`;
                                          const displaySensor = getDisplaySensor(structureKey, sensor);
                                          const chartCacheKey = buildChartCacheKey(structure, sensor.id, displaySensor?.data);
                                          const displaySensorName = `${sensorIdx + 1}）${formatSensorTitleForPreview(sensor)}`;
                                              return (
                                                <div key={sensor.id} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                               <div className="flex items-center justify-between mb-2">
                                                 <div className="text-sm font-medium text-gray-700">{displaySensorName}</div>
                                                 <label className="flex items-center gap-2 cursor-pointer select-none" onClick={(e) => e.stopPropagation()}>
                                                   <input 
                                                     type="checkbox" 
                                                     className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                                                     checked={!!denoiseSensors[sensorKey]}
                                                     onChange={(e) => {
                                                       const checked = e.target.checked;
                                                       setDenoiseSensors(prev => ({ ...prev, [sensorKey]: checked }));
                                                     }}
                                                   />
                                                   <span className="text-xs text-gray-600">该测点去噪</span>
                                                 </label>
                                               </div>
                                                   <SensorChart 
                                                 sensor={displaySensor} 
                                                     color="#2563eb" 
                                                     cacheKey={chartCacheKey}
                                                   />
                                                </div>
                                              );
                                            })
                                          )}
                                        </div>

                                        {/* Analysis Results */}
                                        {isExpanded && analysisConfig.enableGlobal && (
                                          <AnalysisResultView 
                                            qualityResults={analysisResults[structureKey]?.quality}
                                            trendResults={analysisResults[structureKey]?.trend}
                                            deformationResults={analysisResults[structureKey]?.deformation}
                                            accelerationResults={analysisResults[structureKey]?.acceleration}
                                            crackResults={analysisResults[structureKey]?.crack}
                                            correlationResult={analysisResults[structureKey]?.correlation}
                                            aiResult={aiResults[structureKey]}
                                            config={analysisConfig}
                                            isLoadingAi={isAiLoading[structureKey]}
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
                        selectedStructures.map((structure, structureIdx) => {
                          const structureKey = getStructureKey(structure);
                          const isExpanded = expandedAnalysisStructureKey === structureKey;
                          const displayStructureName = `（${structureIdx + 1}）${structure.name}`;
                          return (
                            <details 
                              key={structureKey} 
                              id={`analysis-structure-${structureKey}`}
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
                                        next[`${structureKey}-${sensor.id}`] = true;
                                      }
                                      return next;
                                    });
                                  }
                                  setExpandedAnalysisStructureKey(isExpanded ? null : structureKey);
                                }}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={cn("p-2 rounded-lg transition-colors", isExpanded ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500")}>
                                    <Activity className="w-5 h-5" />
                                  </div>
                                  <h4 className="text-lg font-bold text-gray-900">
                                    {displayStructureName}
                                  </h4>
                                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                    {structure.sensors.length} 个测点
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-3">
                                  <label className="flex items-center gap-2 cursor-pointer select-none group" onClick={(e) => e.stopPropagation()}>
                                    <input 
                                      type="checkbox" 
                                      className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                                      checked={!!(denoiseStructures[structureKey] ?? true)}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setDenoiseStructures(prev => ({ ...prev, [structureKey]: checked }));
                                      }}
                                    />
                                    <span className="text-sm text-gray-700 group-hover:text-green-700">该结构去噪</span>
                                  </label>
                                  {/* Per-structure AI Analysis Button */}
                                  {hasAiConfig && analysisConfig.enableGlobal && analysisConfig.enableAi && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRunAiAnalysis(structureKey);
                                      }}
                                      disabled={isAiLoading[structureKey]}
                                      className={cn(
                                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5",
                                        isAiLoading[structureKey]
                                          ? "bg-purple-50 text-purple-400 cursor-wait"
                                          : "bg-purple-50 text-purple-600 hover:bg-purple-100 hover:shadow-sm"
                                      )}
                                      title="点击运行该结构的 AI 分析"
                                    >
                                      {isAiLoading[structureKey] ? (
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
                                    structure.sensors.map((sensor, sensorIdx) => {
                                      const sensorKey = `${structureKey}-${sensor.id}`;
                                      const displaySensor = getDisplaySensor(structureKey, sensor);
                                      const chartCacheKey = buildChartCacheKey(structure, sensor.id, displaySensor?.data);
                                      const displaySensorName = `${sensorIdx + 1}）${formatSensorTitleForPreview(sensor)}`;
                                      return (
                                        <div key={sensor.id} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                           <div className="flex items-center justify-between mb-2">
                                             <div className="text-sm font-medium text-gray-700">{displaySensorName}</div>
                                             <label className="flex items-center gap-2 cursor-pointer select-none" onClick={(e) => e.stopPropagation()}>
                                               <input 
                                                 type="checkbox" 
                                                 className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                                                 checked={!!denoiseSensors[sensorKey]}
                                                 onChange={(e) => {
                                                   const checked = e.target.checked;
                                                   setDenoiseSensors(prev => ({ ...prev, [sensorKey]: checked }));
                                                 }}
                                               />
                                               <span className="text-xs text-gray-600">该测点去噪</span>
                                             </label>
                                           </div>
                                           <SensorChart 
                                             sensor={displaySensor} 
                                             color="#2563eb" 
                                             cacheKey={chartCacheKey}
                                           />
                                        </div>
                                      );
                                    })
                                  )}
                                </div>

                                {/* Analysis Results */}
                                {isExpanded && analysisConfig.enableGlobal && (
                                  <AnalysisResultView 
                                    qualityResults={analysisResults[structureKey]?.quality}
                                    trendResults={analysisResults[structureKey]?.trend}
                                    deformationResults={analysisResults[structureKey]?.deformation}
                                    accelerationResults={analysisResults[structureKey]?.acceleration}
                                    crackResults={analysisResults[structureKey]?.crack}
                                    correlationResult={analysisResults[structureKey]?.correlation}
                                    aiResult={aiResults[structureKey]}
                                    config={analysisConfig}
                                    isLoadingAi={isAiLoading[structureKey]}
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
    </div>
  );
}
