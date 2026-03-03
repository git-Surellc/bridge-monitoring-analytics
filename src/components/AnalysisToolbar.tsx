import React from 'react';
import { Activity, Brain, ChevronDown, ChevronRight, Thermometer, Ruler, MoveVertical, Zap, ScanLine } from 'lucide-react';
import { cn } from '../utils/cn';

export interface AnalysisConfig {
  enableGlobal: boolean;
  enableAi: boolean;
  enableInclination: boolean;
  enableDisplacement: boolean;
  enableAcceleration: boolean;
  enableTemperature: boolean;
  enableCrack: boolean;
  enableCorrelation: boolean;
}

interface AnalysisToolbarProps {
  config: AnalysisConfig;
  onChange: (key: keyof AnalysisConfig, value: boolean) => void;
  availableTypes: Set<string>;
  hasAiConfig: boolean;
  onAiAnalyze?: () => void;
  isAiAnalyzing?: boolean;
}

export function AnalysisToolbar({ config, onChange, availableTypes, hasAiConfig, onAiAnalyze, isAiAnalyzing }: AnalysisToolbarProps) {
  if (!config.enableGlobal) {
    return (
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 sticky top-16 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer" 
              checked={config.enableGlobal}
              onChange={(e) => onChange('enableGlobal', e.target.checked)}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            <span className="ml-3 text-sm font-medium text-gray-900">开启智能分析</span>
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3 flex flex-wrap items-center gap-6 sticky top-16 z-10 shadow-sm transition-all animate-in slide-in-from-top-2">
      <div className="flex items-center gap-2 border-r border-gray-200 pr-6">
        <label className="relative inline-flex items-center cursor-pointer">
          <input 
            type="checkbox" 
            className="sr-only peer" 
            checked={config.enableGlobal}
            onChange={(e) => onChange('enableGlobal', e.target.checked)}
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          <span className="ml-3 text-sm font-bold text-gray-900">智能分析</span>
        </label>
      </div>

      <div className="flex items-center gap-4">
        {/* AI Switch */}
        {hasAiConfig && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none group">
              <input 
                type="checkbox" 
                className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                checked={config.enableAi}
                onChange={(e) => onChange('enableAi', e.target.checked)}
              />
              <div className="flex items-center gap-1.5 text-sm text-gray-700 group-hover:text-purple-700 transition-colors">
                <Brain className="w-4 h-4" />
                <span>AI 深度洞察</span>
              </div>
            </label>
            
            {config.enableAi && onAiAnalyze && (
              <button
                onClick={onAiAnalyze}
                disabled={isAiAnalyzing}
                className="ml-2 px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-full shadow-sm flex items-center gap-1.5 disabled:opacity-50 transition-all"
              >
                {isAiAnalyzing ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    分析中...
                  </>
                ) : (
                  <>
                    <Brain className="w-3.5 h-3.5" />
                    批量智能分析
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Indicator Switches */}
        {availableTypes.has('inclination') && (
          <label className="flex items-center gap-2 cursor-pointer select-none group">
            <input 
              type="checkbox" 
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              checked={config.enableInclination}
              onChange={(e) => onChange('enableInclination', e.target.checked)}
            />
            <div className="flex items-center gap-1.5 text-sm text-gray-700 group-hover:text-blue-700 transition-colors">
              <Activity className="w-4 h-4" />
              <span>倾角分析</span>
            </div>
          </label>
        )}

        {availableTypes.has('displacement') && (
          <label className="flex items-center gap-2 cursor-pointer select-none group">
            <input 
              type="checkbox" 
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              checked={config.enableDisplacement}
              onChange={(e) => onChange('enableDisplacement', e.target.checked)}
            />
            <div className="flex items-center gap-1.5 text-sm text-gray-700 group-hover:text-blue-700 transition-colors">
              <MoveVertical className="w-4 h-4" />
              <span>沉降分析</span>
            </div>
          </label>
        )}

        {availableTypes.has('acceleration') && (
          <label className="flex items-center gap-2 cursor-pointer select-none group">
            <input 
              type="checkbox" 
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              checked={config.enableAcceleration}
              onChange={(e) => onChange('enableAcceleration', e.target.checked)}
            />
            <div className="flex items-center gap-1.5 text-sm text-gray-700 group-hover:text-blue-700 transition-colors">
              <Zap className="w-4 h-4" />
              <span>加速度分析</span>
            </div>
          </label>
        )}

        {availableTypes.has('crack') && (
          <label className="flex items-center gap-2 cursor-pointer select-none group">
            <input 
              type="checkbox" 
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              checked={config.enableCrack}
              onChange={(e) => onChange('enableCrack', e.target.checked)}
            />
            <div className="flex items-center gap-1.5 text-sm text-gray-700 group-hover:text-blue-700 transition-colors">
              <ScanLine className="w-4 h-4" />
              <span>裂缝分析</span>
            </div>
          </label>
        )}

        {availableTypes.has('temperature') && (
          <label className="flex items-center gap-2 cursor-pointer select-none group">
            <input 
              type="checkbox" 
              className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500"
              checked={config.enableTemperature}
              onChange={(e) => onChange('enableTemperature', e.target.checked)}
            />
            <div className="flex items-center gap-1.5 text-sm text-gray-700 group-hover:text-orange-700 transition-colors">
              <Thermometer className="w-4 h-4" />
              <span>温度分析</span>
            </div>
          </label>
        )}

        {/* Correlation Switch */}
        {availableTypes.has('temperature') && (availableTypes.has('inclination') || availableTypes.has('displacement')) && (
          <div className="border-l border-gray-200 pl-4 ml-2">
            <label className="flex items-center gap-2 cursor-pointer select-none group">
              <input 
                type="checkbox" 
                className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                checked={config.enableCorrelation}
                onChange={(e) => onChange('enableCorrelation', e.target.checked)}
              />
              <div className="flex items-center gap-1.5 text-sm text-gray-700 group-hover:text-indigo-700 transition-colors">
                <div className="flex items-center text-xs bg-indigo-50 px-1.5 py-0.5 rounded text-indigo-600 font-medium">
                  联动
                </div>
                <span>温变相关性</span>
              </div>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
