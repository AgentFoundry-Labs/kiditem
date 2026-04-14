'use client';
import { useCallback } from 'react';
import { ImageIcon, X } from 'lucide-react';

interface ImageUploaderProps {
  label: string;
  description?: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  glass?: boolean;
}

export function ImageUploader({ label, description, value, onChange }: ImageUploaderProps) {
  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onChange(reader.result);
    };
    reader.readAsDataURL(file);
  }, [onChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="text-sm font-semibold text-gray-700">{label}</div>
      )}
      {description && (
        <div className="text-xs text-gray-400">{description}</div>
      )}
      {value ? (
        <div
          className="relative w-full aspect-square rounded-xl overflow-hidden"
          style={{ border: '1px solid #e2e8f0', background: '#f8fafc' }}
        >
          <img src={value} alt={label} className="w-full h-full object-cover" />
          <button
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 p-1 rounded-full transition-colors"
            style={{ background: 'rgba(255,255,255,0.9)' }}
          >
            <X size={14} className="text-slate-500" />
          </button>
        </div>
      ) : (
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="flex flex-col items-center justify-center w-full aspect-square rounded-xl border-2 border-dashed cursor-pointer transition-colors"
          style={{ borderColor: '#cbd5e1', background: '#f8fafc' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#a78bfa';
            e.currentTarget.style.background = 'rgba(167,139,250,0.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#cbd5e1';
            e.currentTarget.style.background = '#f8fafc';
          }}
        >
          <ImageIcon size={28} className="mb-2 text-slate-300" />
          <span className="text-xs text-slate-400">
            클릭 또는 드래그앤드롭
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
      )}
    </div>
  );
}
