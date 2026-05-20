'use client';

import { Brush, Sparkles } from 'lucide-react';

interface ThumbnailActionChooserProps {
  selectedImageUrl: string | null;
  onOpenEdit: () => void;
  onOpenCreative: () => void;
}

export default function ThumbnailActionChooser({
  selectedImageUrl,
  onOpenEdit,
  onOpenCreative,
}: ThumbnailActionChooserProps) {
  const disabled = !selectedImageUrl;
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-slate-900">선택한 이미지로 할 작업</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={onOpenEdit}
          disabled={disabled}
          className="flex min-h-[112px] items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 p-4 text-left transition hover:border-violet-300 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white">
            <Brush size={18} />
          </span>
          <span>
            <span className="block text-base font-black text-slate-900">원본 보정하기</span>
            <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">
              선택한 이미지를 유지하고 배경, 구도, 색감, 품질을 정리합니다.
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenCreative}
          disabled={disabled}
          className="flex min-h-[112px] items-center gap-3 rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-4 text-left transition hover:border-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-fuchsia-600 text-white">
            <Sparkles size={18} />
          </span>
          <span>
            <span className="block text-base font-black text-slate-900">새 장면 만들기</span>
            <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">
              선택한 상품 이미지를 사용해 스튜디오, 사용 컷, 분위기 컷을 만듭니다.
            </span>
          </span>
        </button>
      </div>
    </section>
  );
}
