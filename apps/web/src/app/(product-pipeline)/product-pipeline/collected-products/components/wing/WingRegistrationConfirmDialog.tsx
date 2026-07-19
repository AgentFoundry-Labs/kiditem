'use client';

import { useEffect, useState } from 'react';
import { Loader2, Store, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  validateWingRegistrationOverrides,
  WING_DISPLAY_NAME_MAX,
  type WingRegistrationDraft,
  type WingRegistrationOverrides,
} from '../../lib/wing-registration-flow';

/**
 * 쿠팡 WING 등록 직전 확인 모달.
 *
 * WING 폼이 열리고 나면 자동채움이 끝날 때까지 사용자가 개입할 수 없어서,
 * 노출상품명·등록상품명·옵션·가격·재고를 여기서 확정받는다. 확인을 눌러야
 * 확장으로 넘어가고, 취소하면 아무 일도 일어나지 않는다.
 *
 * 값 검증은 `validateWingRegistrationOverrides()` 하나만 쓴다 — 화면과 전송
 * 경로가 서로 다른 규칙을 갖게 되는 순간 "확인은 됐는데 전송이 막히는" 상태가 된다.
 */
export default function WingRegistrationConfirmDialog({
  draft,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  /** `prepareWingRegistration()` 결과. `null` 이면 모달을 닫아 둔다. */
  draft: WingRegistrationDraft | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (overrides: WingRegistrationOverrides) => void;
}) {
  const [overrides, setOverrides] = useState<WingRegistrationOverrides | null>(null);

  // 초안이 바뀌면(=다른 상품을 열면) 입력을 그 상품의 기본값으로 되돌린다.
  // 이전 상품에서 고친 값이 남아 있으면 엉뚱한 상품에 실린다.
  useEffect(() => {
    setOverrides(draft ? { ...draft.overrides } : null);
  }, [draft]);

  if (!draft || !overrides) return null;

  const errors = validateWingRegistrationOverrides(overrides);
  const nameLength = overrides.productName.trim().length;
  const nameOverLimit = nameLength > WING_DISPLAY_NAME_MAX;
  const patch = (next: Partial<WingRegistrationOverrides>) =>
    setOverrides((prev) => (prev ? { ...prev, ...next } : prev));
  // 숫자 입력은 빈 문자열을 0 으로 읽는다. NaN 을 흘려보내면 검증 메시지가
  // "0원보다 커야 합니다" 가 아니라 조용한 실패가 된다.
  const toNumber = (value: string): number => {
    const parsed = Number(value.replace(/[^\d-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="쿠팡 WING 등록 확인"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-[#ff5a1f]">
              <Store size={18} />
            </div>
            <h2 className="mt-3 text-base font-black text-slate-900">쿠팡 WING 등록 확인</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              확인을 누르면 WING 상품등록 페이지가 열리고 아래 값으로 자동 입력됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <Field label="노출상품명" hint="구매자에게 보이는 이름입니다.">
            <textarea
              value={overrides.productName}
              onChange={(event) => patch({ productName: event.target.value })}
              rows={2}
              className={cn(
                'w-full resize-none rounded-lg border px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-orange-400',
                nameOverLimit ? 'border-rose-400 bg-rose-50' : 'border-slate-200',
              )}
            />
            <div
              className={cn(
                'mt-1 text-right text-[11px] font-bold',
                nameOverLimit ? 'text-rose-600' : 'text-slate-400',
              )}
              aria-live="polite"
            >
              {nameLength} / {WING_DISPLAY_NAME_MAX}자
            </div>
          </Field>

          <Field label="등록상품명 (판매자관리용)" hint="쿠팡 내부 조회용 이름입니다. 구매자에게 보이지 않습니다.">
            <input
              type="text"
              value={overrides.sellerProductName}
              onChange={(event) => patch({ sellerProductName: event.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-orange-400"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="옵션 · 색상">
              <input
                type="text"
                value={overrides.colorValue}
                onChange={(event) => patch({ colorValue: event.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-orange-400"
              />
            </Field>
            <Field label="옵션 · 수량">
              <input
                type="text"
                value={overrides.quantityValue}
                onChange={(event) => patch({ quantityValue: event.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-orange-400"
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="판매가 (원)" hint="10원 단위">
              <input
                type="text"
                inputMode="numeric"
                value={String(overrides.salePrice)}
                onChange={(event) => patch({ salePrice: toNumber(event.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-900 outline-none transition focus:border-orange-400"
              />
            </Field>
            <Field label="정상가 (원)" hint="0이면 판매가 사용">
              <input
                type="text"
                inputMode="numeric"
                value={String(overrides.origPrice)}
                onChange={(event) => patch({ origPrice: toNumber(event.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-orange-400"
              />
            </Field>
            <Field label="재고수량" hint="판매 가능 수량">
              <input
                type="text"
                inputMode="numeric"
                value={String(overrides.stock)}
                onChange={(event) => patch({ stock: toNumber(event.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-orange-400"
              />
            </Field>
          </div>

          {errors.length > 0 && (
            <ul
              className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-bold text-rose-700"
              aria-live="polite"
            >
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm(overrides)}
            disabled={isSubmitting || errors.length > 0}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#ff5a1f] px-4 text-sm font-black text-white transition hover:bg-[#ef4f18] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Store size={15} />}
            확인하고 WING 등록 시작
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    // grid cell 에서 세로로 stretch 되므로 flex-col + mt-auto 로 입력칸을 바닥에 정렬한다.
    // hint 유무·줄수가 달라도(예: 재고칸 hint 가 없거나 짧아도) 한 행의 입력칸 baseline 이 맞는다.
    <label className="flex h-full flex-col">
      <span className="mb-1 block text-[12px] font-black text-slate-700">{label}</span>
      {hint && <span className="mb-1 block text-[11px] font-semibold text-slate-400">{hint}</span>}
      <div className="mt-auto">{children}</div>
    </label>
  );
}
