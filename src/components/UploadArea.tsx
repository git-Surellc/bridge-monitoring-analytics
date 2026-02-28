import React, { useCallback } from 'react';
import { Upload, FileSpreadsheet } from 'lucide-react';
import { cn } from '../utils/cn';

interface UploadAreaProps {
  onUpload: (files: File[]) => void;
  className?: string;
}

export function UploadArea({ onUpload, className }: UploadAreaProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const files = (Array.from(e.dataTransfer.files) as File[]).filter(
        (file: File) =>
          file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          file.type === 'application/vnd.ms-excel' ||
          file.name.endsWith('.xlsx') ||
          file.name.endsWith('.xls')
      );
      if (files.length > 0) {
        onUpload(files);
      }
    },
    [onUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const files = Array.from(e.target.files) as File[];
        onUpload(files);
      }
    },
    [onUpload]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={cn(
        'border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer',
        className
      )}
    >
      <input
        type="file"
        multiple
        accept=".xlsx,.xls"
        className="hidden"
        id="file-upload"
        onChange={handleFileSelect}
      />
      <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
        <div className="bg-blue-100 p-4 rounded-full mb-4">
          <Upload className="w-8 h-8 text-blue-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          上传监测数据
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          将 Excel 文件拖拽至此，或点击选择文件
        </p>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <FileSpreadsheet className="w-4 h-4" />
          <span>支持 .xlsx, .xls 格式</span>
        </div>
      </label>
    </div>
  );
}
