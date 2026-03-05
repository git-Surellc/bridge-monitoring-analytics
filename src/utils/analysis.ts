import { StructureData, SensorData, AnalysisConfig as BaseAnalysisConfig } from '../types';

// ==========================================
// Types & Interfaces
// ==========================================

export interface AnalysisConfig {
  enableGlobal: boolean;
  enableInclination: boolean;
  enableDisplacement: boolean;
  enableAcceleration: boolean;
  enableTemperature: boolean;
  enableCrack: boolean;
  enableCorrelation: boolean;
  enableAi: boolean;
}

export interface DataPoint {
  timestamp: string;
  [key: string]: any;
}

export interface AnalysisResult {
  sensorId: string;
  sensorName: string;
  type: string;
  stats: {
    min: number;
    max: number;
    avg: number;
    amplitude: number;
    trend: 'rising' | 'falling' | 'stable';
  };
  warnings: string[];
}

export interface QualityAnalysisResult {
  missingCount: number;
  missingRate: number;
  outlierCount: number;
  outlierRate: number;
  mean: number;
  std: number;
  cv: number;
  outlierRange: [number, number];
  outlierTimestamps: string[];
}

export interface TrendAnalysisResult {
  slope: number;
  intercept: number;
  rSquared: number;
  pValue: number;
  trendDesc: string;
  rollingMeanData: Array<{ timestamp: string; value: number }>;
}

export interface DeformationAnalysisResult {
  maxValue: number;
  maxTimestamp: string;
  minValue: number;
  minTimestamp: string;
  rangeValue: number;
  periodicFeatures: {
    mainPeriods: (number | string)[];
    amplitudes: number[];
  };
}

export interface AccelerationAnalysisResult {
  pga: number;
  pgaTimestamp: string;
  naturalFreq: number;
  psdValue: number;
  isFreqAbnormal: boolean;
}

export interface CorrelationAnalysisResult {
  correlation: number;
  pValue: number;
  corrStrength: string;
  corrDirection: string;
  isSignificant: boolean;
}

export interface CrackAnalysisResult {
  maxWidth: number;
  dailyGrowthRate: number;
  predictedWidth7d: number;
  rSquared: number;
  riskLevel: string;
}

export interface AiAnalysisResult {
  structureId: string;
  analysis: string;
  timestamp: string;
}

export interface StructureAnalysisResult {
  quality: Record<string, QualityAnalysisResult>;
  trend: Record<string, TrendAnalysisResult>;
  deformation: Record<string, DeformationAnalysisResult>;
  acceleration: Record<string, AccelerationAnalysisResult>;
  crack: Record<string, CrackAnalysisResult>;
  correlation: CorrelationAnalysisResult | null;
}

// ==========================================
// Math Helpers (Lightweight Implementation)
// ==========================================

const mean = (data: number[]): number => {
  if (data.length === 0) return 0;
  return data.reduce((a, b) => a + b, 0) / data.length;
};

const std = (data: number[], avg?: number): number => {
  if (data.length < 2) return 0;
  const m = avg ?? mean(data);
  const variance = data.reduce((a, b) => a + Math.pow(b - m, 2), 0) / (data.length - 1);
  return Math.sqrt(variance);
};

// Simple Linear Regression (Least Squares)
// Returns: slope, intercept, rSquared, pValue (approx)
const linearRegression = (x: number[], y: number[]) => {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0, pValue: 1 };

  const xMean = mean(x);
  const yMean = mean(y);

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - xMean) * (y[i] - yMean);
    den += Math.pow(x[i] - xMean, 2);
  }

  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;

  // Calculate R-squared
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const yPred = slope * x[i] + intercept;
    ssRes += Math.pow(y[i] - yPred, 2);
    ssTot += Math.pow(y[i] - yMean, 2);
  }
  const rSquared = ssTot === 0 ? 0 : 1 - (ssRes / ssTot);

  // Calculate t-statistic for slope
  // SE_slope = sqrt( (SS_res / (n-2)) / SS_xx )
  // SS_xx = den
  let pValue = 1;
  if (n > 2 && den > 0) {
    const seSlope = Math.sqrt((ssRes / (n - 2)) / den);
    const tStat = seSlope === 0 ? 0 : slope / seSlope;
    // Approximate p-value for two-tailed t-test
    // Using a very simple approximation for large N or standard normal
    // For rigorous p-value, we need a T-distribution CDF, but this is a lightweight frontend implementation.
    // We'll use a simple Gaussian approximation for N > 30, or a lookup for small N?
    // Let's use a simple heuristic for significance: if |t| > 2, p < 0.05 usually.
    // Better: use a JS implementation of T-distribution CDF.
    pValue = tTestPValue(tStat, n - 2);
  }

  return { slope, intercept, rSquared, pValue };
};

// Pearson Correlation
const pearsonCorrelation = (x: number[], y: number[]) => {
  const n = x.length;
  if (n < 2) return { correlation: 0, pValue: 1 };

  const xMean = mean(x);
  const yMean = mean(y);
  
  let num = 0;
  let denX = 0;
  let denY = 0;
  
  for (let i = 0; i < n; i++) {
    const dx = x[i] - xMean;
    const dy = y[i] - yMean;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  
  const den = Math.sqrt(denX * denY);
  const r = den === 0 ? 0 : num / den;
  
  // t-test for correlation coefficient
  // t = r * sqrt((n-2) / (1-r^2))
  let pValue = 1;
  if (n > 2 && Math.abs(r) < 1) {
    const t = r * Math.sqrt((n - 2) / (1 - r * r));
    pValue = tTestPValue(t, n - 2);
  } else if (Math.abs(r) >= 1) {
    pValue = 0;
  }
  
  return { correlation: r, pValue };
};

// Simple T-Test P-Value approximation (Two-tailed)
// Based on Abramowitz and Stegun 26.2.17
const tTestPValue = (t: number, df: number): number => {
  const x = Math.abs(t);
  // Normal distribution approximation for large df
  if (df > 30) {
    // 1 / (1 + 0.2316419 * x) ...
    // Simplified: Use Gaussian CDF
    // p = 2 * (1 - CDF(x))
    return 2 * (1 - normalCDF(x));
  }
  
  // Very rough approximation for small df
  // Not precise but enough for "Significant vs Not Significant"
  // Using 1/x^2 decay
  return Math.min(1, 1 / (x * x + 1)); 
};

const normalCDF = (x: number): number => {
  const t = 1 / (1 + 0.2316419 * x);
  const d = 0.3989422804014337 * Math.exp(-x * x / 2);
  const prob = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return 1 - prob;
};


// ==========================================
// Analysis Functions
// ==========================================

export const analyzeStructure = (structure: StructureData, config: BaseAnalysisConfig): StructureAnalysisResult | null => {
  if (!structure.sensors.length) return null;

  const results: StructureAnalysisResult = {
    quality: {},
    trend: {},
    deformation: {},
    acceleration: {},
    crack: {},
    correlation: null
  };

  // 1. Data Quality Analysis (Always run if global enabled, or maybe separate?)
  // For now we assume if global enabled, we check quality
  structure.sensors.forEach(sensor => {
    // Missing Rate, Outliers
    const values = sensor.data.map(d => d.value);
    const n = values.length;
    if (n === 0) return;

    const avg = mean(values);
    const s = std(values, avg);
    
    // Outliers: > 3 sigma
    const outliers = sensor.data.filter(d => Math.abs(d.value - avg) > 3 * s);
    const outlierRate = outliers.length / n;
    
    // Missing: Check time gaps? (Complex without expected interval)
    // Simplified: just stats
    results.quality[sensor.id] = {
      missingCount: 0,
      missingRate: 0,
      outlierCount: outliers.length,
      outlierRate,
      mean: avg,
      std: s,
      cv: avg !== 0 ? s / Math.abs(avg) : 0,
      outlierRange: [avg - 3 * s, avg + 3 * s],
      outlierTimestamps: outliers.map(d => d.time)
    };
  });

  // 2. Trend Analysis (Linear Regression)
  structure.sensors.forEach(sensor => {
    const type = getSensorType(sensor);
    if (!type) return;
    
    // Prepare X (time index) and Y (value)
    // Using index as time proxy for simplicity, or timestamp diff
    const y = sensor.data.map(d => d.value);
    const x = sensor.data.map((_, i) => i);
    
    const { slope, intercept, rSquared, pValue } = linearRegression(x, y);
    
    let trendDesc = 'stable';
    if (pValue < 0.05) {
      if (slope > 0) trendDesc = 'rising';
      else if (slope < 0) trendDesc = 'falling';
    }

    // Rolling Mean (Moving Average) - Window 7 (assuming daily?) or 10% of data
    const window = Math.max(3, Math.floor(y.length / 20));
    const rollingMeanData = [];
    for (let i = 0; i < y.length; i++) {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - window); j <= Math.min(y.length - 1, i + window); j++) {
        sum += y[j];
        count++;
      }
      rollingMeanData.push({ timestamp: sensor.data[i].time, value: sum / count });
    }

    results.trend[sensor.id] = {
      slope,
      intercept,
      rSquared,
      pValue,
      trendDesc,
      rollingMeanData
    };
  });

  // 3. Deformation (Displacement/Inclination)
  if (config.enableDisplacement || config.enableInclination) {
    structure.sensors.forEach(sensor => {
      const type = getSensorType(sensor);
      if ((type === 'displacement' && config.enableDisplacement) || 
          (type === 'inclination' && config.enableInclination)) {
        
        const values = sensor.data.map(d => d.value);
        if (values.length === 0) return;

        const maxVal = Math.max(...values);
        const minVal = Math.min(...values);
        const range = maxVal - minVal;
        
        // Find timestamps
        const maxTime = sensor.data.find(d => d.value === maxVal)?.time || '';
        const minTime = sensor.data.find(d => d.value === minVal)?.time || '';

        results.deformation[sensor.id] = {
          maxValue: maxVal,
          maxTimestamp: maxTime,
          minValue: minVal,
          minTimestamp: minTime,
          rangeValue: range,
          periodicFeatures: { mainPeriods: [], amplitudes: [] } // FFT not implemented
        };
      }
    });
  }

  // 4. Acceleration (Vibration)
  if (config.enableAcceleration) {
    structure.sensors.forEach(sensor => {
      if (getSensorType(sensor) === 'acceleration') {
        const values = sensor.data.map(d => d.value);
        if (values.length === 0) return;

        const pga = Math.max(...values.map(Math.abs));
        const pgaTime = sensor.data.find(d => Math.abs(d.value) === pga)?.time || '';
        
        results.acceleration[sensor.id] = {
          pga,
          pgaTimestamp: pgaTime,
          naturalFreq: 0, // Requires FFT
          psdValue: 0,
          isFreqAbnormal: false
        };
      }
    });
  }

  // 5. Crack
  if (config.enableCrack) {
    structure.sensors.forEach(sensor => {
      if (getSensorType(sensor) === 'crack') {
        const values = sensor.data.map(d => d.value);
        if (values.length < 2) return;
        
        const currentWidth = values[values.length - 1];
        const firstWidth = values[0];
        
        // Simple growth rate
        const growth = currentWidth - firstWidth;
        const days = values.length; // Assuming daily data? Rough.
        const dailyRate = days > 0 ? growth / days : 0;
        
        results.crack[sensor.id] = {
          maxWidth: Math.max(...values),
          dailyGrowthRate: dailyRate,
          predictedWidth7d: currentWidth + dailyRate * 7,
          rSquared: 0,
          riskLevel: dailyRate > 0.1 ? 'high' : (dailyRate > 0.01 ? 'medium' : 'low')
        };
      }
    });
  }

  // 6. Correlation (Between 2 sensors?)
  // Simplified: Find top 2 correlated sensors if enabled
  if (config.enableCorrelation && structure.sensors.length >= 2) {
    // Just compare first two for demo, or find max correlation pair
    // O(N^2) might be slow. Let's just pick first two valid ones.
    const s1 = structure.sensors[0];
    const s2 = structure.sensors[1];
    
    // Need to align timestamps!
    // This is hard without standardized time.
    // Assuming same sampling rate/times for simplicity.
    const len = Math.min(s1.data.length, s2.data.length);
    const v1 = s1.data.slice(0, len).map(d => d.value);
    const v2 = s2.data.slice(0, len).map(d => d.value);
    
    const { correlation, pValue } = pearsonCorrelation(v1, v2);
    
    results.correlation = {
      correlation,
      pValue,
      corrStrength: Math.abs(correlation) > 0.7 ? 'strong' : (Math.abs(correlation) > 0.3 ? 'moderate' : 'weak'),
      corrDirection: correlation > 0 ? 'positive' : 'negative',
      isSignificant: pValue < 0.05
    };
  }

  return results;
};

// ==========================================
// Helper Utilities
// ==========================================

export const getSensorType = (sensor: SensorData): string | null => {
  const name = (sensor.name || '').toLowerCase();
  const sheetType = (sensor.sheetType || '').toLowerCase();
  const text = `${name} ${sheetType}`;

  const KEYWORDS = {
    INCLINATION: ['倾角', 'inclination', 'tilt'],
    DISPLACEMENT: ['竖向位移', '沉降', 'displacement', 'settlement', '位移', '挠度'],
    ACCELERATION: ['加速度', 'acceleration', '振动', 'vibration'],
    TEMPERATURE: ['温度', 'temperature'],
    CRACK: ['裂缝', 'crack'],
  };

  if (KEYWORDS.INCLINATION.some(k => text.includes(k))) return 'inclination';
  if (KEYWORDS.DISPLACEMENT.some(k => text.includes(k))) return 'displacement';
  if (KEYWORDS.ACCELERATION.some(k => text.includes(k))) return 'acceleration';
  if (KEYWORDS.TEMPERATURE.some(k => text.includes(k))) return 'temperature';
  if (KEYWORDS.CRACK.some(k => text.includes(k))) return 'crack';
  
  return null; // or 'other'
};

// ==========================================
// AI Analysis
// ==========================================

export const generateAiPrompt = (structure: StructureData, analysis: StructureAnalysisResult): string => {
  const summary = [];
  summary.push(`Structure: ${structure.name} (ID: ${structure.id})`);
  
  // Add key stats
  Object.entries(analysis.quality).forEach(([id, q]) => {
    summary.push(`Sensor ${id}: Outlier Rate ${(q.outlierRate * 100).toFixed(1)}%, CV ${q.cv.toFixed(2)}`);
  });
  
  // Add trends
  Object.entries(analysis.trend).forEach(([id, t]) => {
    if (t.trendDesc !== 'stable') {
      summary.push(`Sensor ${id} is ${t.trendDesc} (p=${t.pValue.toFixed(3)})`);
    }
  });

  return `Analyze the structural health based on this data:\n${summary.join('\n')}\nProvide a brief assessment and recommendations.`;
};

export const analyzeWithAI = async (structure: StructureData, aiConfig: any): Promise<string> => {
    // Mock implementation or call backend
    // Since we don't have the API key here (it's in localStorage but we shouldn't expose it easily in frontend logic if not needed),
    // we typically call a backend proxy.
    // For now, return a placeholder if not implemented.
    return "AI analysis requires backend integration.";
};

// ==========================================
// Structure Grouping & Sorting
// ==========================================

export interface StructureGroup {
  name: string;
  structures: StructureData[];
}

const parseStructureToken = (token: string) => {
  const t = token.trim();
  const upper = t.toUpperCase();
  
  if (upper.startsWith('Q')) {
    return { id: t.substring(1), type: '1' }; // Q -> Bridge (Type 1)
  }
  if (upper.startsWith('S')) {
    return { id: t.substring(1), type: '2' }; // S -> Tunnel (Type 2)
  }
  return { id: t, type: null }; // No prefix -> Match any type (or strictly ID match)
};

export const sortStructuresByUserOrder = (structures: StructureData[], orderStr: string): StructureData[] => {
  if (!orderStr || !orderStr.trim()) return structures;
  
  const tokens = orderStr.split(/[,\n]/).map(t => parseStructureToken(t)).filter(t => t.id);
  if (tokens.length === 0) return structures;
  
  return [...structures].sort((a, b) => {
    // Find index in user tokens
    // Match logic: ID must match. If token has type, structure type must match (defaulting to '1' if undefined).
    const idxA = tokens.findIndex(t => 
      t.id === a.id && (!t.type || t.type === (a.type || '1'))
    );
    const idxB = tokens.findIndex(t => 
      t.id === b.id && (!t.type || t.type === (b.type || '1'))
    );
    
    // If both found, sort by index
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    
    // If one found, it comes first
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    
    // Fallback to original order
    return 0;
  });
};

export const groupStructures = (structures: StructureData[], groupStr: string): StructureGroup[] => {
  if (!groupStr || !groupStr.trim()) {
    return [{ name: '', structures }];
  }
  
  const groups: StructureGroup[] = [];
  const assignedIds = new Set<string>(); // We track assigned structure objects actually, by unique ID
  // Since ID might be duplicated across types, we should track unique key
  const getUniqueKey = (s: StructureData) => `${s.id}-${s.type || '1'}`;
  const assignedKeys = new Set<string>();
  
  const lines = groupStr.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    
    const separatorIndex = line.indexOf(':') !== -1 ? line.indexOf(':') : line.indexOf('：');
    
    if (separatorIndex !== -1) {
      const groupName = line.substring(0, separatorIndex).trim();
      const idsStr = line.substring(separatorIndex + 1);
      const tokens = idsStr.split(/[,，]/).map(t => parseStructureToken(t)).filter(t => t.id);
      
      // Filter structures that match any token in this group
      const groupStructures = structures.filter(s => {
        return tokens.some(t => 
          t.id === s.id && (!t.type || t.type === (s.type || '1'))
        );
      });
      
      if (groupStructures.length > 0) {
        // Sort within group based on token order
        groupStructures.sort((a, b) => {
          const idxA = tokens.findIndex(t => t.id === a.id && (!t.type || t.type === (a.type || '1')));
          const idxB = tokens.findIndex(t => t.id === b.id && (!t.type || t.type === (b.type || '1')));
          return idxA - idxB;
        });
        
        groups.push({
          name: groupName,
          structures: groupStructures
        });
        groupStructures.forEach(s => assignedKeys.add(getUniqueKey(s)));
      }
    }
  }
  
  // Handle unassigned structures
  const unassigned = structures.filter(s => !assignedKeys.has(getUniqueKey(s)));
  if (unassigned.length > 0) {
    groups.push({
      name: '未分组',
      structures: unassigned
    });
  }
  
  return groups;
};
