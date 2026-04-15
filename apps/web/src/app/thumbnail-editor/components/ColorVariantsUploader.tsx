'use client';
import { useCallback, useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  values: string[];
  onChange: (urls: string[]) => void;
  max?: number;
}

export function ColorVariantsUploader({ values, onChange, max = 8 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const readFiles = useCallback(async (files: FileList) => {
    const remaining = max - values.length;
    if (remaining <= 0) {
      toast.error(`최대 ${max}장까지 가능합니다`);
      return;
    }
    const accepted = Array.from(files).slice(0, remaining);
    if (files.length > accepted.length) {
      toast.error(`최대 ${max}장까지 가능합니다 (초과분 무시)`);
    }
    const next: string[] = [];
    for (const file of accepted) {
      if (!file.type.startsWith('image/')) continue;
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      next.push(url);
    }
    if (next.length > 0) onChange([...values, ...next]);
  }, [values, onChange, max]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!atMax && e.dataTransfer.files.length) void readFiles(e.dataTransfer.files);
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void readFiles(e.target.files);
    e.target.value = '';
  };

  const removeAt = (i: number) => {
    onChange(values.filter((_, idx) => idx !== i));
  };

  const atMax = values.length >= max;

  return (
    <div className="space-y-3">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => !atMax && inputRef.current?.click()}
        className={cn(
          'rounded-xl border-2 border-dashed p-6 text-center transition-colors select-none',
          atMax
            ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-violet-50/30 border-violet-300 text-violet-700 hover:bg-violet-50 cursor-pointer',
        )}
      >
        <Upload size={20} className="mx-auto mb-2" />
        <div className="text-xs font-medium">
          {atMax ? `${max}장 모두 업로드됨` : '이미지를 드래그하거나 클릭'}
        </div>
        <div className="text-[10px] text-gray-400 mt-1">색상별로 1장씩 (흰배경 권장)</div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleInput}
          className="hidden"
        />
      </div>

      {values.length > 0 && (
        <>
          <div className="text-[10px] text-gray-400 font-medium">
            {values.length} / {max} · 최소 2장 이상
          </div>
          <div className="grid grid-cols-4 gap-2">
            {values.map((url, i) => (
              <div key={`${i}-${url.slice(-12)}`} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black transition-colors"
                  aria-label="삭제"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
