'use client';

import { AlertTriangle, Trash2, X } from 'lucide-react';
import type { RegisteredChannelListing } from '../lib/channel-listings-api';

/**
 * 쿠팡 등록상품 삭제 안내.
 *
 * Wing 브라우저 조작은 확장이 담당하지만, 현재 서버에는 삭제 결과를
 * 독립적으로 확인할 대체 경로가 없다. 확인되지 않은 삭제를 시작하면
 * 우리 등록상품과 쿠팡 상태가 갈라질 수 있으므로 시작 버튼을 비활성화한다.
 */
export default function ListingDeleteDialog({
  listing,
  onClose,
}: {
  listing: RegisteredChannelListing | null;
  onClose: () => void;
}) {
  if (!listing) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="등록상품 삭제"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-black text-rose-700">
            <AlertTriangle size={16} />
            등록상품 삭제
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded p-1 text-slate-400 transition hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3">
            <p className="text-[12px] font-black text-rose-900">{listing.listingName}</p>
            <p className="mt-1 text-[11px] font-semibold text-rose-700">
              등록상품ID {listing.externalId}
            </p>
          </div>

          <div
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] font-bold leading-5 text-amber-800"
          >
            쿠팡 상품 삭제는 현재 지원하지 않습니다. 삭제 결과를 확인할 대체 경로가 없어
            시작할 수 없습니다. 쿠팡 Wing에서 상태를 직접 확인해 주세요.
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-600 transition hover:bg-slate-50"
          >
            닫기
          </button>
          <button
            type="button"
            disabled
            title="쿠팡 상품 삭제는 현재 지원하지 않습니다."
            className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-black text-white opacity-50"
          >
            <Trash2 size={15} />
            삭제 지원 안 함
          </button>
        </div>
      </div>
    </div>
  );
}
