'use client';

import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RegistrationThumbnailOption } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/registration-selection';

interface ProductThumbnailResultsProps {
  options: RegistrationThumbnailOption[];
  selectedRegistrationThumbnailUrl: string | null;
  onPreviewThumbnail: (url: string | null) => void;
  onSelectRegistrationThumbnail: (option: RegistrationThumbnailOption) => void;
}

export default function ProductThumbnailResults({
  options,
  selectedRegistrationThumbnailUrl,
  onPreviewThumbnail,
  onSelectRegistrationThumbnail,
}: ProductThumbnailResultsProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-slate-900">이 상품 생성 결과</h3>
      {options.length === 0 ? (
        <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm font-semibold text-slate-400">
          아직 생성 결과가 없습니다
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {options.map((option, index) => {
            const selected = selectedRegistrationThumbnailUrl === option.url;
            return (
              <div
                key={`${option.generatedCandidateId ?? option.url}`}
                className={cn(
                  'relative aspect-square overflow-hidden rounded-lg border',
                  selected
                    ? 'border-emerald-500 ring-2 ring-emerald-200'
                    : 'border-slate-200',
                  )}
              >
                <button
                  type="button"
                  onClick={() => onPreviewThumbnail(option.url)}
                  className="absolute inset-0"
                  aria-label={`생성 결과 미리보기 ${index + 1}`}
                >
                  <img src={option.url} alt="" className="h-full w-full object-cover" />
                </button>
                {selected ? (
                  <span className="absolute bottom-0 left-0 right-0 bg-emerald-600 py-1 text-center text-[11px] font-bold text-white">
                    <CheckCircle2 size={12} className="mr-1 inline-block" />
                    등록 대표
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectRegistrationThumbnail(option)}
                    className="absolute bottom-1 left-1 right-1 z-10 rounded-md bg-white/95 px-2 py-1 text-[11px] font-bold text-emerald-700 shadow-sm hover:bg-emerald-50"
                  >
                    등록 대표로 사용
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
