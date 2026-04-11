'use client';
import { useCallback } from 'react';
import { ImageIcon, X } from 'lucide-react';

interface ImageUploaderProps {
  label: string;
  description?: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
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
      <div className="text-sm font-semibold text-slate-700">{label}</div>
      {description && <div className="text-xs text-slate-400">{description}</div>}
      {value ? (
        <div className="relative w-full aspect-square max-w-[240px] rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
          <img src={value} alt={label} className="w-full h-full object-cover" />
          <button
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 p-1 bg-white/80 rounded-full hover:bg-white transition-colors"
          >
            <X size={14} className="text-slate-600" />
          </button>
        </div>
      ) : (
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="flex flex-col items-center justify-center w-full aspect-square max-w-[240px] rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 cursor-pointer hover:border-purple-400 hover:bg-purple-50/30 transition-colors"
        >
          <ImageIcon size={32} className="text-slate-300 mb-2" />
          <span className="text-xs text-slate-400">클릭 또는 드래그앤드롭</span>
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
