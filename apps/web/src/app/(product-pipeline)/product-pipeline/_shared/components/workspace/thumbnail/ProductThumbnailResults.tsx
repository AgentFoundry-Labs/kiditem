'use client';

import type { RegistrationThumbnailOption } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/registration-selection';

interface ProductThumbnailResultsProps {
  options: RegistrationThumbnailOption[];
  onPreviewThumbnail: (url: string | null) => void;
}

export default function ProductThumbnailResults({
  options,
  onPreviewThumbnail,
}: ProductThumbnailResultsProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">생성 이미지 이력</h3>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-500">
          {options.length}장
        </span>
      </div>
      {options.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm font-semibold text-slate-400">
          아직 생성 결과가 없습니다
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-3">
          {options.map((option, index) => {
            return (
              <div
                key={`${option.generatedCandidateId ?? option.url}`}
                className="relative aspect-square overflow-hidden rounded-lg border border-slate-200"
              >
                <button
                  type="button"
                  onClick={() => onPreviewThumbnail(option.url)}
                  className="absolute inset-0"
                  aria-label={`생성 결과 미리보기 ${index + 1}`}
                >
                  <img src={option.url} alt="" className="h-full w-full object-cover" />
                </button>
                <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                  생성 {index + 1}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
