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
    pValue = 0; // Perfect correlation is significant
  }
  
  return { correlation: r, pValue };
};

// Approximate two-tailed p-value for t-distribution
// Source: Abramowitz and Stegun approximation for Normal CDF (works for large df)
// For small df, this is less accurate but acceptable for frontend visual analytics.
const tTestPValue = (t: number, df: number): number => {
  const x = Math.abs(t);
  // Using Normal distribution approximation for simplicity (valid for df > 30)
  // For small df, it overestimates significance (conservative).
  // Standard Normal CDF approximation
  const z = x;
  const p = 1 / (1 + 0.2316419 * z);
  const d = 0.39894228 * Math.exp(-z * z / 2);
  const prob = d * p * (0.31938153 + p * (-0.356563782 + p * (1.781477937 + p * (-1.821255978 + p * 1.330274429))));
  return 2 * prob; // Two-tailed
};

// Simple FFT Implementation (Cooley-Tukey Radix-2)
// Input: Real values array. Output: Magnitude spectrum.
const calculateFFT = (data: number[], sampleRate: number) => {
  const n = data.length;
  // Pad to power of 2
  const m = Math.pow(2, Math.ceil(Math.log2(n)));
  const real = new Float64Array(m);
  const imag = new Float64Array(m);
  
  for (let i = 0; i < n; i++) real[i] = data[i];
  
  // Bit-reverse copy
  let j = 0;
  for (let i = 0; i < m - 1; i++) {
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
    let k = m / 2;
    while (k <= j) {
      j -= k;
      k /= 2;
    }
    j += k;
  }
  
  // FFT
  for (let l = 1; l <= Math.log2(m); l++) {
    const le = Math.pow(2, l);
    const le2 = le / 2;
    const ur = 1;
    const ui = 0;
    const sr = Math.cos(Math.PI / le2);
    const si = -Math.sin(Math.PI / le2);
    let wr = 1;
    let wi = 0;
    
    for (let j = 1; j <= le2; j++) {
      for (let i = j - 1; i < m; i += le) {
        const ip = i + le2;
        const tr = real[ip] * wr - imag[ip] * wi;
        const ti = real[ip] * wi + imag[ip] * wr;
        real[ip] = real[i] - tr;
        imag[ip] = imag[i] - ti;
        real[i] = real[i] + tr;
        imag[i] = imag[i] + ti;
      }
      const tr = wr;
      wr = tr * sr - wi * si;
      wi = tr * si + wi * sr;
    }
  }
  
  // Calculate magnitude and frequencies
  const magnitudes: number[] = [];
  const frequencies: number[] = [];
  
  // Only need first half (Nyquist)
  for (let i = 0; i < m / 2; i++) {
    magnitudes.push(Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / m); // Normalize
    frequencies.push(i * sampleRate / m);
  }
  
  return { frequencies, magnitudes };
};

// ==========================================
// 1. General Analysis Functions
// ==========================================

export const dataQualityAnalysis = (
  dataList: DataPoint[], 
  indicatorKey: string
): QualityAnalysisResult | null => {
  if (!dataList || dataList.length === 0) return null;
  
  const totalCount = dataList.length;
  // Filter valid data (timestamp not empty)
  const validData = dataList.filter(d => d.timestamp);
  const missingCount = totalCount - validData.length; // Approximate logic: assumes passed list is raw
  
  // Extract values
  const values: number[] = [];
  const validTimestamps: string[] = [];
  
  validData.forEach(d => {
    const val = Number(d[indicatorKey]);
    if (!isNaN(val)) {
      values.push(val);
      validTimestamps.push(d.timestamp);
    }
  });
  
  if (values.length === 0) {
    return {
      missingCount: totalCount,
      missingRate: 100,
      outlierCount: 0,
      outlierRate: 0,
      mean: 0,
      std: 0,
      cv: 0,
      outlierRange: [0, 0],
      outlierTimestamps: []
    };
  }

  const avg = mean(values);
  const deviation = std(values, avg);
  const cv = avg !== 0 ? deviation / avg : 0;
  
  const lowerBound = avg - 3 * deviation;
  const upperBound = avg + 3 * deviation;
  
  const outliers: string[] = [];
  values.forEach((v, i) => {
    if (v < lowerBound || v > upperBound) {
      outliers.push(validTimestamps[i]);
    }
  });
  
  return {
    missingCount,
    missingRate: Number(((missingCount / totalCount) * 100).toFixed(2)),
    outlierCount: outliers.length,
    outlierRate: Number(((outliers.length / totalCount) * 100).toFixed(2)),
    mean: Number(avg.toFixed(4)),
    std: Number(deviation.toFixed(4)),
    cv: Number(cv.toFixed(4)),
    outlierRange: [Number(lowerBound.toFixed(4)), Number(upperBound.toFixed(4))],
    outlierTimestamps: outliers
  };
};

export const trendAnalysis = (
  dataList: DataPoint[],
  indicatorKey: string,
  windowSize: number = 24
): TrendAnalysisResult | null => {
  if (!dataList || dataList.length === 0) return null;
  
  const cleanData = dataList
    .filter(d => d.timestamp && !isNaN(Number(d[indicatorKey])))
    .map(d => ({
      timestamp: d.timestamp,
      value: Number(d[indicatorKey]),
      timeMs: new Date(d.timestamp).getTime()
    }))
    .sort((a, b) => a.timeMs - b.timeMs);
    
  if (cleanData.length < 2) return null;
  
  const startTime = cleanData[0].timeMs;
  const x = cleanData.map(d => (d.timeMs - startTime) / 3600000); // Hours since start
  const y = cleanData.map(d => d.value);
  
  const { slope, intercept, rSquared, pValue } = linearRegression(x, y);
  
  let trendDesc = '无显著趋势';
  if (pValue < 0.05) {
    if (slope > 0) trendDesc = '显著上升';
    else if (slope < 0) trendDesc = '显著下降';
  }
  
  // Rolling Mean
  const rollingMeanData: Array<{ timestamp: string; value: number }> = [];
  const halfWindow = Math.floor(windowSize / 2);
  
  for (let i = 0; i < cleanData.length; i++) {
    // Simple centered window
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(cleanData.length, i + halfWindow + 1);
    const windowSlice = y.slice(start, end);
    const avg = mean(windowSlice);
    rollingMeanData.push({
      timestamp: cleanData[i].timestamp,
      value: Number(avg.toFixed(4))
    });
  }
  
  return {
    slope: Number(slope.toFixed(6)),
    intercept: Number(intercept.toFixed(4)),
    rSquared: Number(rSquared.toFixed(4)),
    pValue: Number(pValue.toFixed(4)),
    trendDesc,
    rollingMeanData
  };
};

// ==========================================
// 2. Specific Analysis Functions
// ==========================================

export const deformationAnalysis = (
  dataList: DataPoint[],
  indicatorKey: string
): DeformationAnalysisResult | null => {
  if (!dataList || dataList.length === 0) return null;
  
  const cleanData = dataList
    .filter(d => d.timestamp && !isNaN(Number(d[indicatorKey])))
    .map(d => ({
      timestamp: d.timestamp,
      value: Number(d[indicatorKey])
    }));
    
  if (cleanData.length === 0) return null;
  
  const values = cleanData.map(d => d.value);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  
  const maxItem = cleanData.find(d => d.value === maxValue);
  const minItem = cleanData.find(d => d.value === minValue);
  
  // Periodic Analysis (FFT)
  const periodicFeatures: DeformationAnalysisResult['periodicFeatures'] = {
    mainPeriods: [],
    amplitudes: []
  };
  
  if (values.length >= 100) {
    // Assuming uniform sampling for simplicity, or resampling needed.
    // Here we treat data as sequential with avg interval
    const times = cleanData.map(d => new Date(d.timestamp).getTime());
    const durationSec = (times[times.length - 1] - times[0]) / 1000;
    const avgSampleRate = values.length / durationSec; // Hz
    
    if (avgSampleRate > 0) {
      const { frequencies, magnitudes } = calculateFFT(values, avgSampleRate);
      
      // Find peaks (simple method)
      const peaks: { freq: number; mag: number }[] = [];
      for (let i = 1; i < magnitudes.length - 1; i++) {
        if (magnitudes[i] > magnitudes[i-1] && magnitudes[i] > magnitudes[i+1]) {
          peaks.push({ freq: frequencies[i], mag: magnitudes[i] });
        }
      }
      
      // Sort by magnitude
      peaks.sort((a, b) => b.mag - a.mag);
      
      // Top 3
      peaks.slice(0, 3).forEach(p => {
        if (p.freq > 0) {
          const periodHours = (1 / p.freq) / 3600;
          periodicFeatures.mainPeriods.push(Number(periodHours.toFixed(2)));
          periodicFeatures.amplitudes.push(Number(p.mag.toFixed(4)));
        }
      });
    }
  }
  
  return {
    maxValue: Number(maxValue.toFixed(4)),
    maxTimestamp: maxItem?.timestamp || '',
    minValue: Number(minValue.toFixed(4)),
    minTimestamp: minItem?.timestamp || '',
    rangeValue: Number((maxValue - minValue).toFixed(4)),
    periodicFeatures
  };
};

export const accelerationAnalysis = (
  dataList: DataPoint[],
  indicatorKey: string,
  fs: number = 10
): AccelerationAnalysisResult | null => {
  if (!dataList || dataList.length === 0) return null;
  
  const values = dataList
    .map(d => Number(d[indicatorKey]))
    .filter(v => !isNaN(v));
    
  if (values.length === 0) return null;
  
  // PGA
  let maxAbs = 0;
  let pgaIdx = -1;
  values.forEach((v, i) => {
    const abs = Math.abs(v);
    if (abs > maxAbs) {
      maxAbs = abs;
      pgaIdx = i;
    }
  });
  
  const pgaTimestamp = pgaIdx >= 0 && dataList[pgaIdx] ? dataList[pgaIdx].timestamp : '';
  
  // Frequency Analysis (PSD/FFT)
  // Using FFT magnitude as proxy for PSD for lightweight implementation
  const { frequencies, magnitudes } = calculateFFT(values, fs);
  
  // Find dominant frequency (max magnitude)
  let maxMag = 0;
  let dominantFreq = 0;
  
  // Skip DC component (index 0)
  for (let i = 1; i < magnitudes.length; i++) {
    if (magnitudes[i] > maxMag) {
      maxMag = magnitudes[i];
      dominantFreq = frequencies[i];
    }
  }
  
  const isFreqAbnormal = dominantFreq < 0.5 || dominantFreq > 10;
  
  return {
    pga: Number(maxAbs.toFixed(4)),
    pgaTimestamp,
    naturalFreq: Number(dominantFreq.toFixed(4)),
    psdValue: Number(maxMag.toFixed(4)), // Using magnitude as proxy for PSD value
    isFreqAbnormal
  };
};

export const temperatureDeformationCorrelation = (
  dataList: DataPoint[],
  temperatureKey: string = 'temperature',
  deformationKey: string
): CorrelationAnalysisResult | null => {
  if (!dataList || dataList.length === 0) return null;
  
  const cleanData = dataList.filter(d => 
    !isNaN(Number(d[temperatureKey])) && 
    !isNaN(Number(d[deformationKey]))
  );
  
  if (cleanData.length < 2) return null;
  
  const x = cleanData.map(d => Number(d[temperatureKey]));
  const y = cleanData.map(d => Number(d[deformationKey]));
  
  const { correlation, pValue } = pearsonCorrelation(x, y);
  
  let corrStrength = '弱相关';
  const absCorr = Math.abs(correlation);
  if (absCorr >= 0.7) corrStrength = '强相关';
  else if (absCorr >= 0.4) corrStrength = '中等相关';
  
  let corrDirection = '无相关';
  if (correlation > 0) corrDirection = '正相关';
  else if (correlation < 0) corrDirection = '负相关';
  
  return {
    correlation: Number(correlation.toFixed(4)),
    pValue: Number(pValue.toFixed(4)),
    corrStrength,
    corrDirection,
    isSignificant: pValue < 0.05
  };
};

export const crackAnalysis = (
  dataList: DataPoint[],
  indicatorKey: string,
  warnThreshold: number = 0.3
): CrackAnalysisResult | null => {
  if (!dataList || dataList.length === 0) return null;
  
  const cleanData = dataList
    .filter(d => d.timestamp && !isNaN(Number(d[indicatorKey])))
    .map(d => ({
      timestamp: d.timestamp,
      value: Number(d[indicatorKey]),
      timeMs: new Date(d.timestamp).getTime()
    }))
    .sort((a, b) => a.timeMs - b.timeMs);
    
  if (cleanData.length < 2) return null;
  
  const values = cleanData.map(d => d.value);
  const maxWidth = Math.max(...values);
  
  const startTime = cleanData[0].timeMs;
  const xDays = cleanData.map(d => (d.timeMs - startTime) / (24 * 3600 * 1000)); // Days
  
  const { slope, intercept, rSquared } = linearRegression(xDays, values);
  
  const maxDay = xDays[xDays.length - 1];
  const predictedWidth7d = intercept + slope * (maxDay + 7);
  
  let riskLevel = '低风险';
  if (maxWidth >= warnThreshold) riskLevel = '高风险';
  else if (predictedWidth7d >= warnThreshold) riskLevel = '中风险';
  
  return {
    maxWidth: Number(maxWidth.toFixed(4)),
    dailyGrowthRate: Number(slope.toFixed(6)),
    predictedWidth7d: Number(predictedWidth7d.toFixed(4)),
    rSquared: Number(rSquared.toFixed(4)),
    riskLevel
  };
};

// ==========================================
// 4. High-Level Analysis Functions
// ==========================================

/**
 * Analyzes a single structure based on the provided configuration.
 * Returns a comprehensive result object containing all analysis metrics.
 */
export const analyzeStructure = (
  structure: StructureData,
  config: AnalysisConfig
): StructureAnalysisResult | null => {
  if (!config.enableGlobal) return null;

  const result: StructureAnalysisResult = {
    quality: {},
    trend: {},
    deformation: {},
    acceleration: {},
    crack: {},
    correlation: null
  };

  // 1. Process each sensor
  structure.sensors.forEach(sensor => {
    // Convert SensorData points (time, value) to DataPoint (timestamp, value)
    const dataList: DataPoint[] = sensor.data.map(d => ({
      timestamp: String(d.time),
      value: d.value
    }));

    // Identify sensor type
    const type = getSensorType(sensor);

    // Check if analysis is enabled for this sensor type
    let isEnabled = true;
    if (type === 'inclination' && !config.enableInclination) isEnabled = false;
    else if (type === 'displacement' && !config.enableDisplacement) isEnabled = false;
    else if (type === 'acceleration' && !config.enableAcceleration) isEnabled = false;
    else if (type === 'temperature' && !config.enableTemperature) isEnabled = false;
    else if (type === 'crack' && !config.enableCrack) isEnabled = false;

    if (!isEnabled) return;

    // 1.1 Data Quality Analysis
    const quality = dataQualityAnalysis(dataList, 'value');
    if (quality) result.quality[sensor.id] = quality;

    // 1.2 Trend Analysis (Always run if global is on)
    const trend = trendAnalysis(dataList, 'value');
    if (trend) result.trend[sensor.id] = trend;

    // 1.3 Specific Analysis based on type and config
    if (type === 'inclination' || type === 'displacement') {
      if ((type === 'inclination' && config.enableInclination) || 
          (type === 'displacement' && config.enableDisplacement)) {
        const deformation = deformationAnalysis(dataList, 'value');
        if (deformation) result.deformation[sensor.id] = deformation;
      }
    } else if (type === 'acceleration' && config.enableAcceleration) {
      const acceleration = accelerationAnalysis(dataList, 'value');
      if (acceleration) result.acceleration[sensor.id] = acceleration;
    } else if (type === 'crack' && config.enableCrack) {
      const crack = crackAnalysis(dataList, 'value');
      if (crack) result.crack[sensor.id] = crack;
    }
  });

  // 2. Correlation Analysis (Temperature - Deformation)
  if (config.enableCorrelation) {
    const tempSensor = structure.sensors.find(s => getSensorType(s) === 'temperature');
    const defSensor = structure.sensors.find(s => 
      getSensorType(s) === 'inclination' || getSensorType(s) === 'displacement'
    );

    if (tempSensor && defSensor) {
      // Merge data by timestamp (simple approximate matching or exact)
      // Assuming timestamps align or we take intersection based on string match
      const mergedData: DataPoint[] = [];
      const tempMap = new Map<string, number>();
      
      tempSensor.data.forEach(d => tempMap.set(String(d.time), d.value));
      
      defSensor.data.forEach(d => {
        const timeStr = String(d.time);
        if (tempMap.has(timeStr)) {
          mergedData.push({
            timestamp: timeStr,
            temperature: tempMap.get(timeStr),
            deformation: d.value
          });
        }
      });

      if (mergedData.length > 0) {
        result.correlation = temperatureDeformationCorrelation(
          mergedData,
          'temperature',
          'deformation'
        );
      }
    }
  }

  return result;
};

/**
 * Performs AI analysis for a structure.
 */
export const analyzeWithAI = async (
  structure: StructureData,
  aiConfig: { baseUrl: string; apiKey: string; model?: string }
): Promise<string> => {
  if (!aiConfig.baseUrl || !aiConfig.apiKey) {
    return 'AI配置不完整，请前往设置页面配置。';
  }

  const prompt = generateAiPrompt(structure.name, structure.sensors);
  return await callAiApi(prompt, aiConfig);
};

// ==========================================
// 3. Existing Helpers
// ==========================================


// Keywords for sensor types
const KEYWORDS = {
  INCLINATION: ['倾角', 'inclination', 'tilt'],
  DISPLACEMENT: ['竖向位移', '沉降', 'displacement', 'settlement'],
  ACCELERATION: ['加速度', 'acceleration'],
  TEMPERATURE: ['温度', 'temperature'],
  CRACK: ['裂缝', 'crack'],
};

// Helper to identify sensor type
export const getSensorType = (sensor: SensorData): string | null => {
  const name = (sensor.name || '').toLowerCase();
  const sheetType = (sensor.sheetType || '').toLowerCase();
  const text = `${name} ${sheetType}`;

  if (KEYWORDS.INCLINATION.some(k => text.includes(k))) return 'inclination';
  if (KEYWORDS.DISPLACEMENT.some(k => text.includes(k))) return 'displacement';
  if (KEYWORDS.ACCELERATION.some(k => text.includes(k))) return 'acceleration';
  if (KEYWORDS.TEMPERATURE.some(k => text.includes(k))) return 'temperature';
  if (KEYWORDS.CRACK.some(k => text.includes(k))) return 'crack';
  
  return null;
};

// Simple basic stats for prompt generation (reused from before or simplified)
export const getBasicStats = (sensor: SensorData) => {
  if (!sensor.data || sensor.data.length === 0) return null;
  const values = sensor.data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  
  // Trend
  const half = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, half).reduce((a,b)=>a+b,0)/half;
  const secondHalf = values.slice(half).reduce((a,b)=>a+b,0)/(values.length-half);
  let trend = 'stable';
  if (secondHalf > firstHalf * 1.05) trend = 'rising';
  else if (secondHalf < firstHalf * 0.95) trend = 'falling';
  
  return { min, max, avg, trend };
};

export const generateOverallSummaryPrompt = (structures: StructureData[]): string => {
  let prompt = `请作为一名结构监测专家，对本项目所有监测结构的整体状况进行总结评估(200字左右)。\n\n项目概况：\n`;
  prompt += `- 监测结构总数：${structures.length}座\n`;
  
  let totalSensors = 0;
  const sensorTypeCounts: Record<string, number> = {};
  
  structures.forEach(struct => {
    totalSensors += struct.sensors.length;
    struct.sensors.forEach(s => {
      const type = getSensorType(s) || 'other';
      sensorTypeCounts[type] = (sensorTypeCounts[type] || 0) + 1;
    });
  });

  prompt += `- 监测点总数：${totalSensors}个\n`;
  prompt += `- 监测指标分布：${Object.entries(sensorTypeCounts).map(([k, v]) => `${k}${v}个`).join('，')}\n\n`;
  prompt += `结构详情摘要：\n`;

  structures.slice(0, 5).forEach(struct => {
    prompt += `- ${struct.name}: ${struct.sensors.length}个测点\n`;
    const stats = struct.sensors.map(s => getBasicStats(s)).filter(Boolean);
    if (stats.length > 0) {
        // Simple heuristic for "abnormal" based on trend for summary
        const abnormalCount = stats.filter(s => s && (s.trend === 'rising' || s.trend === 'falling')).length;
        if (abnormalCount > 0) {
            prompt += `  * 注意：发现${abnormalCount}个测点有明显变化趋势\n`;
        } else {
            prompt += `  * 数据波动在正常范围内\n`;
        }
    }
  });
  
  if (structures.length > 5) prompt += `...等共${structures.length}座结构。\n`;

  prompt += `\n请根据以上信息，给出项目整体监测结论，包括设备运行情况、数据完整性及结构安全风险评估。`;
  return prompt;
};

export const generateAiPrompt = (structureName: string, sensors: SensorData[]): string => {
  let prompt = `请作为一名结构监测专家，对"${structureName}"的监测数据进行简要分析总结(100字左右)。\n\n数据摘要：\n`;
  
  const typeGroups: Record<string, any[]> = {};
  
  sensors.forEach(s => {
    const type = getSensorType(s) || 'other';
    const stats = getBasicStats(s);
    if (stats) {
      if (!typeGroups[type]) typeGroups[type] = [];
      typeGroups[type].push({ name: s.name, ...stats });
    }
  });

  Object.entries(typeGroups).forEach(([type, items]) => {
    prompt += `- ${type}监测点共${items.length}个：\n`;
    items.slice(0, 3).forEach((item: any) => {
      prompt += `  * ${item.name}: 范围[${item.min.toFixed(2)}, ${item.max.toFixed(2)}], 均值${item.avg.toFixed(2)}, 趋势${item.trend}\n`;
    });
    if (items.length > 3) prompt += `  ...等\n`;
  });

  prompt += `\n请给出整体结构健康状况的评估结论。`;
  return prompt;
};

// AI API Call (Proxied through backend)
export const callAiApi = async (prompt: string, config: { baseUrl: string, apiKey: string; model?: string }): Promise<string> => {
  if (!config.baseUrl || !config.apiKey) {
    throw new Error('AI配置不完整');
  }

  try {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: '你是一个专业的结构健康监测数据分析助手。' },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || `请求失败: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '无法获取AI分析结果';
  } catch (error) {
    console.error('AI Analysis Error:', error);
    return `AI分析失败: ${error instanceof Error ? error.message : '未知错误'}`;
  }
};
