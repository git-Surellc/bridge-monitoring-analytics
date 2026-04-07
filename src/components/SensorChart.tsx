import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  // Legend
} from 'recharts';
import { SensorData } from '../types';
import { format } from 'date-fns';

interface SensorChartProps {
  sensor: SensorData;
  color?: string;
  cacheKey?: string;
}

type CachedChartRecord = {
  key: string;
  dataUrl: string;
  createdAt: number;
};

const CHART_CACHE_DB = 'bma_chart_cache_v1';
const CHART_CACHE_STORE = 'charts';
const MAX_CACHED_CHARTS = 200;

const openChartCacheDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const req = indexedDB.open(CHART_CACHE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CHART_CACHE_STORE)) {
        const store = db.createObjectStore(CHART_CACHE_STORE, { keyPath: 'key' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
};

const getCachedChart = async (key: string): Promise<string | null> => {
  const db = await openChartCacheDb();
  return new Promise((resolve) => {
    const tx = db.transaction(CHART_CACHE_STORE, 'readonly');
    const store = tx.objectStore(CHART_CACHE_STORE);
    const req = store.get(key);
    req.onsuccess = () => {
      const record = req.result as CachedChartRecord | undefined;
      resolve(record?.dataUrl || null);
    };
    req.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
};

const trimChartCache = async () => {
  const db = await openChartCacheDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(CHART_CACHE_STORE, 'readonly');
    const store = tx.objectStore(CHART_CACHE_STORE);
    const countReq = store.count();
    countReq.onsuccess = () => {
      const count = countReq.result || 0;
      if (count <= MAX_CACHED_CHARTS) {
        resolve();
        return;
      }
      const toDelete = count - MAX_CACHED_CHARTS;
      const delTx = db.transaction(CHART_CACHE_STORE, 'readwrite');
      const delStore = delTx.objectStore(CHART_CACHE_STORE);
      const index = delStore.index('createdAt');
      let deleted = 0;
      const cursorReq = index.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || deleted >= toDelete) return;
        delStore.delete(cursor.primaryKey);
        deleted += 1;
        cursor.continue();
      };
      delTx.oncomplete = () => resolve();
      delTx.onerror = () => resolve();
    };
    countReq.onerror = () => resolve();
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
};

const setCachedChart = async (record: CachedChartRecord): Promise<void> => {
  const db = await openChartCacheDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(CHART_CACHE_STORE, 'readwrite');
    const store = tx.objectStore(CHART_CACHE_STORE);
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
  await trimChartCache().catch(() => {});
};

const svgToDataUrl = (svgEl: SVGSVGElement): string => {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const rect = svgEl.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  if (!clone.getAttribute('viewBox')) {
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }
  const xml = new XMLSerializer().serializeToString(clone);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
};

export function SensorChart({ sensor, color = '#2563eb', cacheKey }: SensorChartProps) {
  const KEYWORDS = {
    INCLINATION: ['倾角', 'inclination', 'tilt', '测斜'],
    DISPLACEMENT: ['竖向位移', '沉降', 'displacement', 'settlement', '位移', '挠度', '光电挠度', '拉线位移'],
    ACCELERATION: ['加速度', 'acceleration', '振动', 'vibration', '一体化振动'],
    TEMPERATURE: ['温度', 'temperature'],
    CRACK: ['裂缝', 'crack'],
  };

  const chartRef = React.useRef<HTMLDivElement | null>(null);
  const [cachedDataUrl, setCachedDataUrlState] = React.useState<string | null>(null);
  const [cacheChecked, setCacheChecked] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setCacheChecked(false);
    setCachedDataUrlState(null);
    if (!cacheKey) {
      setCacheChecked(true);
      return;
    }
    getCachedChart(cacheKey)
      .then((url) => {
        if (cancelled) return;
        setCachedDataUrlState(url);
        setCacheChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        setCacheChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  const getSensorType = (s: SensorData) => {
    if (s.sensorType && typeof s.sensorType === 'string') return s.sensorType;
    const name = (s.name || '').toLowerCase();
    const sheetType = (s.sheetType || '').toLowerCase();
    const text = `${name} ${sheetType}`;
    if (KEYWORDS.INCLINATION.some(k => text.includes(k))) return 'inclination';
    if (KEYWORDS.DISPLACEMENT.some(k => text.includes(k))) return 'displacement';
    if (KEYWORDS.ACCELERATION.some(k => text.includes(k))) return 'acceleration';
    if (KEYWORDS.TEMPERATURE.some(k => text.includes(k))) return 'temperature';
    if (KEYWORDS.CRACK.some(k => text.includes(k))) return 'crack';
    return null;
  };

  const getUnit = (s: SensorData) => {
    if (s.unit && typeof s.unit === 'string' && s.unit.trim()) return s.unit.trim();
    const type = getSensorType(s);
    if (type === 'inclination') return '°';
    if (type === 'acceleration') return 'mg';
    if (type === 'displacement') return 'mm';
    if (type === 'crack') return 'mm';
    return 'mm';
  };

  const unit = getUnit(sensor);

  const formatSensorTitle = (s: SensorData) => {
    const deviceName = String(s.sheetType || s.deviceType || '').trim();
    const rawName = String(s.name || '').trim();
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

  // Helper to format tick
  const formatTick = (tick: any) => {
    // If it looks like an Excel serial date (e.g. 45000), format it
    if (typeof tick === 'number' && tick > 40000 && tick < 60000) {
       // Excel base date is 1899-12-30
       const date = new Date((tick - 25569) * 86400 * 1000);
       return format(date, 'MM-dd');
    }
    // If it's a string date
    if (typeof tick === 'string' && !isNaN(Date.parse(tick))) {
        return format(new Date(tick), 'MM-dd');
    }
    return tick;
  };
  
  const formatTooltipLabel = (label: any) => {
    if (typeof label === 'number' && label > 40000 && label < 60000) {
      const date = new Date((label - 25569) * 86400 * 1000);
      return format(date, 'yyyy-MM-dd HH:mm');
    }
    if (typeof label === 'string' && !isNaN(Date.parse(label))) {
      return format(new Date(label), 'yyyy-MM-dd HH:mm');
    }
    return label;
  };

  React.useEffect(() => {
    if (!cacheKey) return;
    if (!cacheChecked) return;
    if (cachedDataUrl) return;
    const root = chartRef.current;
    if (!root) return;

    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const svg = root.querySelector('svg');
        if (!svg) return;
        const url = svgToDataUrl(svg as unknown as SVGSVGElement);
        setCachedChart({ key: cacheKey, dataUrl: url, createdAt: Date.now() }).catch(() => {});
      });
    });
    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [cacheKey, cacheChecked, cachedDataUrl]);

  return (
    <div className="w-full h-[300px] bg-white rounded-lg p-4 border border-gray-100">
      <h4 className="text-sm font-medium text-gray-700 mb-4 text-center">
        {formatSensorTitle(sensor)} 时程曲线（单位：{unit}）
      </h4>
      <div ref={chartRef} className="w-full h-full">
        {cacheKey && !cacheChecked ? (
          <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">图表缓存加载中...</div>
        ) : cachedDataUrl ? (
          <img src={cachedDataUrl} alt={`${sensor.name || ''} chart`} className="w-full h-full object-contain" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={sensor.data}
              margin={{ top: 5, right: 20, bottom: 5, left: 40 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="time" 
                tickFormatter={formatTick}
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickMargin={10}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: '#6b7280' }}
                domain={['auto', 'auto']}
                label={{ value: `单位 (${unit})`, angle: -90, position: 'left', offset: 10, style: { fill: '#6b7280', fontSize: 12 } }}
              />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                labelFormatter={formatTooltipLabel}
                formatter={(value: any) => {
                  const n = Number(value);
                  if (!Number.isFinite(n)) return [String(value ?? ''), ''];
                  return [`${n.toFixed(3)} ${unit}`, ''];
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                name=""
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
