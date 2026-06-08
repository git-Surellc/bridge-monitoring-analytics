import React from 'react';
import { Activity, Thermometer, MoveVertical, Zap, ScanLine, EyeOff } from 'lucide-react';

export interface AnalysisConfig {
  enableGlobal: boolean;
  enableInclination: boolean;
  enableDisplacement: boolean;
  enableAcceleration: boolean;
  enableTemperature: boolean;
  enableCrack: boolean;
  enableCorrelation: boolean;
  enableDenoise?: boolean;
  hideInclinometerTemperature?: boolean;
}

interface AnalysisToolbarProps {
  config: AnalysisConfig;
  onChange: (key: keyof AnalysisConfig, value: boolean) => void;
  availableTypes: Set<string>;
  onOpenDenoiseConfig?: () => void;
  onOpenDeviceMetaConfig?: () => void;
  onOpenIndicatorSelect?: () => void;
}

export function AnalysisToolbar({ config, onChange, availableTypes, onOpenDenoiseConfig, onOpenDeviceMetaConfig, onOpenIndicatorSelect }: AnalysisToolbarProps) {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3 flex flex-wrap items-center gap-6 sticky top-16 z-10 shadow-sm">
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

      {/* Always-available controls (independent of 智能分析 toggle) */}
      <div className="flex items-center gap-4">
        {onOpenIndicatorSelect && (
          <button
            onClick={onOpenIndicatorSelect}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 rounded-full border border-gray-200 transition-colors"
          >
            指标选择
          </button>
        )}
        {onOpenDeviceMetaConfig && (
          <button
            onClick={onOpenDeviceMetaConfig}
            className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-full border border-blue-200 transition-colors"
          >
            设备/单位设置
          </button>
        )}
        <label className="flex items-center gap-2 cursor-pointer select-none group">
          <input
            type="checkbox"
            className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
            checked={!!config.enableDenoise}
            onChange={(e) => onChange('enableDenoise', e.target.checked)}
          />
          <div className="flex items-center gap-1.5 text-sm text-gray-700 group-hover:text-green-700 transition-colors">
            <span>去噪点</span>
          </div>
        </label>
        {!!config.enableDenoise && onOpenDenoiseConfig && (
          <button
            onClick={onOpenDenoiseConfig}
            className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-full border border-green-200 transition-colors"
          >
            去噪配置
          </button>
        )}

        <label className="flex items-center gap-2 cursor-pointer select-none group">
          <input
            type="checkbox"
            className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
            checked={!!config.hideInclinometerTemperature}
            onChange={(e) => onChange('hideInclinometerTemperature', e.target.checked)}
          />
          <div className="flex items-center gap-1.5 text-sm text-gray-700 group-hover:text-amber-700 transition-colors">
            <EyeOff className="w-4 h-4" />
            <span>盒式固定测斜仪·隐藏温度</span>
          </div>
        </label>
      </div>

      {/* Analysis-type switches (gated by 智能分析 toggle) */}
      {config.enableGlobal && (
        <div className="flex items-center gap-4 border-l border-gray-200 pl-6">
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

          {availableTypes.has('temperature') && (availableTypes.has('inclination') || availableTypes.has('displacement')) && (
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
          )}
        </div>
      )}
    </div>
  );
}
