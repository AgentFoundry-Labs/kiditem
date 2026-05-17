'use client';

import { ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RegistrationThumbnailOption } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/registration-selection';

interface ThumbnailSourcePickerProps {
  options: RegistrationThumbnailOption[];
  selectedUrl: string | null;
  onSelect: (url: string) => void;
  onAddImage: () => void;
}

function labelForUrl(url: string): string {
  return url.split('/').pop()?.split('?')[0] || '선택 이미지';
}

export default function ThumbnailSourcePicker({
  options,
  selectedUrl,
  onSelect,
  onAddImage,
}: ThumbnailSourcePickerProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-900">기준 이미지 선택</h3>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {options.map((option) => {
          const selected = selectedUrl === option.url;
          return (
            <button
              key={`${option.kind}-${option.url}`}
              type="button"
              onClick={() => onSelect(option.url)}
              className={cn(
                'group relative aspect-square overflow-hidden rounded-lg border text-left transition',
                selected
                  ? 'border-violet-500 ring-2 ring-violet-200'
                  : 'border-slate-200 hover:border-violet-300',
              )}
              aria-label={labelForUrl(option.url)}
            >
              <img src={option.url} alt="" className="h-full w-full object-cover" />
              <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                {option.kind === 'generated' ? '생성' : '원본'}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAddImage}
          className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs font-bold text-slate-500 hover:border-violet-300 hover:text-violet-600"
        >
          <ImagePlus size={22} />
          이미지 추가
        </button>
      </div>
    </section>
  );
}
