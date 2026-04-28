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
        <div className="text-sm font-semibold text-[var(--text-secondary)]">{label}</div>
      )}
      {description && (
        <div className="text-xs text-[var(--text-muted)]">{description}</div>
      )}
      {value ? (
        <div className="relative w-full aspect-square rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--surface-sunken)]">
          <img src={value} alt={label} className="w-full h-full object-cover" />
          <button
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 p-1 rounded-full transition-colors bg-[var(--surface)]/90 hover:bg-[var(--surface)]"
          >
            <X size={14} className="text-[var(--text-tertiary)]" />
          </button>
        </div>
      ) : (
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="flex flex-col items-center justify-center w-full aspect-square rounded-xl border-2 border-dashed cursor-pointer transition-colors border-[var(--border-strong)] bg-[var(--surface-sunken)] hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
        >
          <ImageIcon size={28} className="mb-2 text-[var(--text-muted)]" />
          <span className="text-xs text-[var(--text-muted)]">
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
