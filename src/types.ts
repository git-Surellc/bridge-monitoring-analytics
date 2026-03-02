export interface DataPoint {
  time: string | number;
  value: number;
  [key: string]: any;
}

export interface SensorData {
  id: string;
  name: string;
  unit?: string;
  data: DataPoint[];
  stats?: {
    min: number;
    max: number;
    minTime: string | number;
    maxTime: string | number;
    amplitude: number;
  };
}

export interface BridgeData {
  id: string;
  name: string;
  type?: string;
  sensors: SensorData[];
}

export interface AnalysisConfig {
  threshold: number;
  unit: string;
}

export interface ReportCover {
  organization: string;
  project: string;
  title: string;
  period: string;
  footerCompany: string;
  footerDate: string;
}

export type SectionType = 'text' | 'chart_analysis' | 'device_status' | 'toc';

export interface ReportSection {
  id: string;
  type: SectionType;
  title: string;
  content?: string; // For 'text'
  apiUrl?: string; // For 'device_status'
}

export interface ReportTemplate {
  id: string;
  name: string;
  cover: ReportCover;
  sections: ReportSection[];
}

export interface LogEntry {
  id: string;
  name?: string;
  type?: string;
  status: 'success' | 'error' | 'info' | 'skipped';
  msg: string;
  downloadUrl?: string;
  fromCache?: boolean;
}
