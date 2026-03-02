import * as XLSX from 'xlsx';
import { StructureData, SensorData } from '../types';
import { format, addDays } from 'date-fns';

function getExcelDate(serial: number): Date {
  // Excel base date is Dec 30, 1899
  const epoch = new Date(1899, 11, 30);
  return addDays(epoch, serial);
}

export const parseWorkbook = (workbook: XLSX.WorkBook, fileName: string): StructureData => {
  const sensorsMap = new Map<string, SensorData>();

  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (jsonData.length < 2) {
      return; // Skip empty sheets
    }

    // Row 0 is headers
    const headers = jsonData[0] as string[];
    // Assuming first column is always Time
    const sensorNames = headers.slice(1);

    // Initialize or get existing sensors
    sensorNames.forEach((name, index) => {
      const key = `${sheetName}::${name}`;
      if (!sensorsMap.has(key)) {
        sensorsMap.set(key, {
          id: `sensor-${sheetName}-${name}-${index}`,
          name: name,
          deviceType: sheetName,
          sheetType: sheetName,
          data: [],
          stats: {
            min: Infinity,
            max: -Infinity,
            minTime: '',
            maxTime: '',
            amplitude: 0
          }
        });
      }
    });

    // Parse rows
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i] as any[];
      const timeVal = row[0];
      
      if (timeVal === undefined || timeVal === null) continue;

      let formattedTime: string;
      // Handle Excel date format
      if (typeof timeVal === 'number') {
         // Assume Excel serial date if > 1000 (roughly year 1902+)
         if (timeVal > 1000) {
           const date = getExcelDate(timeVal);
           formattedTime = format(date, 'yyyy-MM-dd HH:mm:ss');
         } else {
           formattedTime = String(timeVal);
         }
      } else {
        formattedTime = String(timeVal);
      }
      
      sensorNames.forEach((name, index) => {
        const val = row[index + 1];
        const sensor = sensorsMap.get(`${sheetName}::${name}`);
        
        if (sensor && typeof val === 'number') {
          sensor.data.push({ time: formattedTime, value: val });
          
          if (val < sensor.stats!.min) {
            sensor.stats!.min = val;
            sensor.stats!.minTime = formattedTime;
          }
          if (val > sensor.stats!.max) {
            sensor.stats!.max = val;
            sensor.stats!.maxTime = formattedTime;
          }
        }
      });
    }
  });

  const sensors = Array.from(sensorsMap.values());

  // Finalize stats
  sensors.forEach(sensor => {
    // Sort data by time ascending
    sensor.data.sort((a, b) => {
      if (a.time < b.time) return -1;
      if (a.time > b.time) return 1;
      return 0;
    });

    if (sensor.stats) {
      sensor.stats.amplitude = Number((sensor.stats.max - sensor.stats.min).toFixed(3));
      if (sensor.stats.min === Infinity) {
        sensor.stats = undefined;
      }
    }
  });

  return {
    id: fileName,
    name: fileName.replace(/\.[^/.]+$/, ""),
    sensors: sensors.filter(s => s.data.length > 0)
  };
};

export const parseExcelFile = async (file: File): Promise<StructureData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const structureData = parseWorkbook(workbook, file.name);
        resolve(structureData);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};

export const parseExcelArrayBuffer = async (buffer: ArrayBuffer, fileName: string): Promise<StructureData> => {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' });
    return parseWorkbook(workbook, fileName);
  } catch (err) {
    throw new Error('解析 Excel 数据失败');
  }
};
