'use client';

import { AlertCircle, X } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

type UnmatchedImageRowsBannerProps = {
  unmatchedCount: number;
  onDismiss: () => void;
};

export function UnmatchedImageRowsBanner({
  unmatchedCount,
  onDismiss,
}: UnmatchedImageRowsBannerProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            이미지 동기화에서 내부 상품을 찾지 못한 쿠팡 행 {formatNumber(unmatchedCount)}건이 있습니다.
          </p>
          <p className="mt-0.5 text-xs text-amber-700">
            이 결과는 채널 SKU 재고 매칭과 별개입니다. 이미지 원본 식별자를 확인해 주세요.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="배너 닫기"
        className="shrink-0 rounded-lg p-1.5 text-amber-700 hover:bg-amber-100 hover:text-amber-900"
      >
        <X size={16} />
      </button>
    </div>
  );
}
