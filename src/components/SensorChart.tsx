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
}

export function SensorChart({ sensor, color = '#2563eb' }: SensorChartProps) {
  const KEYWORDS = {
    INCLINATION: ['倾角', 'inclination', 'tilt', '测斜'],
    DISPLACEMENT: ['竖向位移', '沉降', 'displacement', 'settlement', '位移', '挠度', '光电挠度', '拉线位移'],
    ACCELERATION: ['加速度', 'acceleration', '振动', 'vibration', '一体化振动'],
    TEMPERATURE: ['温度', 'temperature'],
    CRACK: ['裂缝', 'crack'],
  };

  const getSensorType = (s: SensorData) => {
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
    const type = getSensorType(s);
    if (type === 'inclination') return '°';
    if (type === 'acceleration') return 'mg';
    if (type === 'displacement') return 'mm';
    if (type === 'crack') return 'mm';
    return 'mm';
  };

  const unit = getUnit(sensor);

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

  return (
    <div className="w-full h-[300px] bg-white rounded-lg p-4 border border-gray-100">
      <h4 className="text-sm font-medium text-gray-700 mb-4 text-center">
        {sensor.name} 时程曲线（单位：{unit}）
      </h4>
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
            labelFormatter={formatTick}
          />
          {/* legend removed per requirement */}
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
    </div>
  );
}
