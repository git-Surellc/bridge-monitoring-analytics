import React from 'react';
import { 
  QualityAnalysisResult, 
  TrendAnalysisResult, 
  DeformationAnalysisResult, 
  AccelerationAnalysisResult, 
  CorrelationAnalysisResult, 
  CrackAnalysisResult,
  AiAnalysisResult
} from '../utils/analysis';
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  AlertTriangle, 
  ThermometerSun, 
  Activity, 
  Search, 
  AlertCircle,
  CheckCircle2,
  Waves
} from 'lucide-react';
import { AnalysisConfig } from './AnalysisToolbar';

interface AnalysisResultViewProps {
  // Map of sensorId -> Results
  qualityResults?: Record<string, QualityAnalysisResult>;
  trendResults?: Record<string, TrendAnalysisResult>;
  deformationResults?: Record<string, DeformationAnalysisResult>;
  accelerationResults?: Record<string, AccelerationAnalysisResult>;
  crackResults?: Record<string, CrackAnalysisResult>;
  correlationResult?: CorrelationAnalysisResult | null;
  aiResult?: string | null; // AI result is just text string now based on updated analysis.ts
  config: AnalysisConfig;
  isLoadingAi?: boolean;
}

export function AnalysisResultView({ 
  qualityResults = {}, 
  trendResults = {}, 
  deformationResults = {}, 
  accelerationResults = {}, 
  crackResults = {}, 
  correlationResult, 
  aiResult, 
  config, 
  isLoadingAi 
}: AnalysisResultViewProps) {
  
  if (!config.enableGlobal) return null;

  const hasAnyResult = 
    Object.keys(qualityResults).length > 0 || 
    Object.keys(trendResults).length > 0 || 
    correlationResult || 
    (config.enableAi && (aiResult || isLoadingAi));

  if (!hasAnyResult) return null;

  return (
    <div className="mt-8 space-y-8 animate-in fade-in duration-500 print:break-before-page">
      <div className="flex items-center gap-3 border-b border-gray-200 pb-4">
        <div className="bg-indigo-600 w-1.5 h-8 rounded-full"></div>
        <h3 className="text-xl font-bold text-gray-900">算法分析模块</h3>
        <span className="text-sm text-gray-500 px-2 py-0.5 bg-gray-100 rounded-full">
          基于实时监测数据
        </span>
      </div>

      <div className="grid grid-cols-1 gap-8">
        
        {/* 1. Correlation Analysis (Top Priority if exists) */}
        {config.enableCorrelation && correlationResult && (
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 p-6 rounded-xl border border-indigo-100 shadow-sm">
            <div className="flex items-center gap-3 mb-4 text-indigo-800">
              <div className="p-2 bg-white rounded-lg shadow-sm text-indigo-600">
                <ThermometerSun className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-lg">温度-变形联动分析</h4>
                <p className="text-xs text-indigo-600 opacity-80">Temperature-Deformation Correlation</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white/60 p-4 rounded-lg">
                <div className="text-sm text-gray-500 mb-1">相关系数 (Pearson)</div>
                <div className="text-2xl font-mono font-bold text-gray-900">{correlationResult.correlation.toFixed(4)}</div>
              </div>
              <div className="bg-white/60 p-4 rounded-lg">
                <div className="text-sm text-gray-500 mb-1">显著性 (P-Value)</div>
                <div className={`text-xl font-mono font-bold ${correlationResult.isSignificant ? 'text-green-600' : 'text-gray-400'}`}>
                  {correlationResult.pValue.toFixed(4)}
                </div>
                <div className="text-xs text-gray-400 mt-1">{correlationResult.isSignificant ? '显著相关' : '未通过显著性检验'}</div>
              </div>
              <div className="bg-white/60 p-4 rounded-lg">
                <div className="text-sm text-gray-500 mb-1">相关强度</div>
                <div className="text-lg font-bold text-indigo-700">{correlationResult.corrStrength}</div>
              </div>
              <div className="bg-white/60 p-4 rounded-lg">
                <div className="text-sm text-gray-500 mb-1">相关方向</div>
                <div className="text-lg font-bold text-indigo-700">{correlationResult.corrDirection}</div>
              </div>
            </div>
          </div>
        )}

        {/* 2. Specific Analysis Results */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Loop through all available sensor results */}
          {Array.from(new Set([
            ...Object.keys(qualityResults),
            ...Object.keys(trendResults),
            ...Object.keys(deformationResults),
            ...Object.keys(accelerationResults),
            ...Object.keys(crackResults)
          ])).map((sensorId) => {
            const quality = qualityResults[sensorId];
            const trend = trendResults[sensorId];
            const deformation = deformationResults[sensorId];
            const acceleration = accelerationResults[sensorId];
            const crack = crackResults[sensorId];

            // Determine Card Type & Color
            let typeLabel = '通用监测';
            let icon = <Activity className="w-5 h-5" />;
            let borderColor = 'border-gray-200';
            
            if (deformation) {
              typeLabel = '变形分析';
              icon = <TrendingUp className="w-5 h-5" />;
              borderColor = 'border-blue-200';
            } else if (acceleration) {
              typeLabel = '振动分析';
              icon = <Waves className="w-5 h-5" />;
              borderColor = 'border-purple-200';
            } else if (crack) {
              typeLabel = '裂缝分析';
              icon = <AlertTriangle className="w-5 h-5" />;
              borderColor = 'border-orange-200';
            }

            return (
              <div key={sensorId} className={`bg-white rounded-xl border ${borderColor} shadow-sm overflow-hidden`}>
                {/* Header */}
                <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">{icon}</span>
                    <span className="font-bold text-gray-900">{sensorId}</span>
                    <span className="text-xs px-2 py-0.5 bg-white border border-gray-200 rounded text-gray-500">
                      {typeLabel}
                    </span>
                  </div>
                  {trend && (
                    <div className={`text-xs font-medium px-2 py-1 rounded flex items-center gap-1 ${
                      trend.trendDesc.includes('显著') ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {trend.trendDesc.includes('上升') ? <TrendingUp className="w-3 h-3" /> : 
                       trend.trendDesc.includes('下降') ? <TrendingDown className="w-3 h-3" /> : 
                       <Minus className="w-3 h-3" />}
                      {trend.trendDesc}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                  {/* Quality Stats */}
                  {quality && (
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      <div className="bg-gray-50 p-2 rounded">
                        <div className="text-gray-400 mb-1">均值</div>
                        <div className="font-mono font-semibold">{quality.mean.toFixed(4)}</div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded">
                        <div className="text-gray-400 mb-1">CV</div>
                        <div className="font-mono font-semibold">{quality.cv.toFixed(4)}</div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded">
                        <div className="text-gray-400 mb-1">缺失率</div>
                        <div className={`${quality.missingRate > 5 ? 'text-red-600' : 'text-gray-900'} font-mono font-semibold`}>
                          {Number(quality.missingRate).toFixed(4)}%
                        </div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded">
                        <div className="text-gray-400 mb-1">异常点</div>
                        <div className={`${quality.outlierCount > 0 ? 'text-orange-600' : 'text-gray-900'} font-mono font-semibold`}>
                          {quality.outlierCount}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Trend Details */}
                  {trend && (
                    <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-gray-100">
                      <div className="flex justify-between items-center px-1">
                        <span className="text-gray-500">趋势斜率</span>
                        <span className="font-mono font-medium text-gray-700">{trend.slope.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between items-center px-1">
                        <span className="text-gray-500">拟合度(R²)</span>
                        <span className="font-mono font-medium text-gray-700">{trend.rSquared.toFixed(4)}</span>
                      </div>
                    </div>
                  )}

                  {/* Specific Metrics */}
                  {deformation && (
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">极差 (Range)</span>
                        <span className="font-mono font-bold">{deformation.rangeValue.toFixed(4)}</span>
                      </div>
                      {deformation.periodicFeatures.mainPeriods.length > 0 && (
                        <div className="text-xs text-gray-500 space-y-1">
                          <div>
                            <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded mr-1">周期 (h)</span>
                            {deformation.periodicFeatures.mainPeriods.join(', ')}
                          </div>
                          <div className="text-gray-400 pl-1">
                             幅值: {deformation.periodicFeatures.amplitudes.map(a => a.toFixed(4)).join(', ')}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {acceleration && (
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">PGA</span>
                        <span className="font-mono font-bold">{acceleration.pga.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">主频 (Hz)</span>
                        <span className={`font-mono font-bold ${acceleration.isFreqAbnormal ? 'text-red-600' : 'text-green-600'}`}>
                          {acceleration.naturalFreq.toFixed(4)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">PSD峰值</span>
                        <span className="font-mono text-gray-600">{acceleration.psdValue.toFixed(4)}</span>
                      </div>
                      {acceleration.isFreqAbnormal && (
                        <div className="text-xs text-red-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> 频率异常 (正常范围 0.5-10Hz)
                        </div>
                      )}
                    </div>
                  )}

                  {crack && (
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">当前最大宽</span>
                        <span className="font-mono font-bold">{crack.maxWidth} mm</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">7日预测</span>
                        <span className="font-mono font-bold">{crack.predictedWidth7d} mm</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">拟合度 (R²)</span>
                        <span className="font-mono text-gray-600">{crack.rSquared}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                         <span className={`text-xs px-2 py-1 rounded font-bold text-white ${
                           crack.riskLevel === '高风险' ? 'bg-red-500' :
                           crack.riskLevel === '中风险' ? 'bg-orange-500' : 'bg-green-500'
                         }`}>
                           {crack.riskLevel}
                         </span>
                         <span className="text-xs text-gray-400">日增长: {crack.dailyGrowthRate} mm/d</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 3. AI Analysis Module */}
        {config.enableAi && (
          <div className="bg-gradient-to-br from-purple-50 via-white to-purple-50 p-6 rounded-xl border border-purple-100 shadow-sm relative overflow-hidden">
             {/* Background decoration */}
             <div className="absolute top-0 right-0 p-4 opacity-5">
               <Brain className="w-32 h-32 text-purple-600" />
             </div>

             <div className="flex items-center gap-3 mb-4 relative z-10">
               <div className="p-2 bg-white rounded-lg shadow-sm text-purple-600">
                 <Brain className="w-6 h-6" />
               </div>
               <div>
                 <h4 className="font-bold text-lg text-gray-900">AI 智能诊断结论</h4>
                 <p className="text-xs text-purple-600 opacity-80">Artificial Intelligence Diagnosis</p>
               </div>
             </div>

             <div className="bg-white/80 backdrop-blur-sm p-6 rounded-xl border border-purple-100 shadow-sm relative z-10 min-h-[100px]">
               {isLoadingAi ? (
                 <div className="flex flex-col items-center justify-center gap-3 py-4 text-purple-600">
                   <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                   <span className="text-sm font-medium animate-pulse">AI 正在深度分析监测数据...</span>
                 </div>
               ) : aiResult ? (
                 <div className="prose prose-purple max-w-none">
                   <p className="text-gray-800 leading-relaxed whitespace-pre-wrap text-justify">
                     {aiResult}
                   </p>
                   <div className="mt-4 flex items-center justify-end gap-2 text-xs text-purple-400">
                     <CheckCircle2 className="w-3 h-3" />
                     <span>Analysis generated by AI Model</span>
                   </div>
                 </div>
               ) : (
                 <div className="text-center text-gray-400 py-4 text-sm">
                   暂无 AI 分析结果，请确保配置正确并开启 AI 分析开关
                 </div>
               )}
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
