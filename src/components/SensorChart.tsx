import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { SensorData } from '../types';
import { format } from 'date-fns';

interface SensorChartProps {
  sensor: SensorData;
  color?: string;
}

export function SensorChart({ sensor, color = '#2563eb' }: SensorChartProps) {
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
      <h4 className="text-sm font-medium text-gray-700 mb-4 text-center">{sensor.name} 时程曲线</h4>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={sensor.data}>
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
          />
          <Tooltip 
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            labelFormatter={formatTick}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            name={sensor.name}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
