'use client';

import Link from 'next/link';
import { AlertCircle, ArrowRight, X } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface UnmatchedReconciliationBannerProps {
  unmatchedCount: number;
  onDismiss: () => void;
}

/**
 * Shown after the Coupang image sync finishes with `unmatched > 0`.
 *
 * The image sync exposes "이미지 없음 / 매칭 필요" rows but does not write to
 * the channel reconciliation queue itself. The CTA navigates the user to
 * `/product-hub/matching` where they can run a Wing scan and triage the
 * unmatched rows under a proper queue.
 */
export function UnmatchedReconciliationBanner({
  unmatchedCount,
  onDismiss,
}: UnmatchedReconciliationBannerProps) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <AlertCircle size={18} className="text-amber-600 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-amber-900">
            매칭이 필요한 쿠팡 row {formatNumber(unmatchedCount)}건이 있습니다
          </div>
          <div className="text-xs text-amber-700 mt-0.5">
            KidItem 옵션과 자동 연결되지 않은 쿠팡 상품을 매칭 센터에서 확인하세요. legacyCode 정확 일치가 안 된 row 는 수동 검토가 필요합니다.
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/product-hub/matching"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700"
        >
          매칭 센터로 이동
          <ArrowRight size={14} />
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="배너 닫기"
          className="p-1.5 text-amber-700 hover:text-amber-900"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
