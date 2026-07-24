'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Store, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WING_CATEGORY_DEFINITIONS } from '../../lib/wing-category-presets';
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
  completion = null,
  onCancel,
  onConfirm,
  onConfirmExternal,
}: {
  /** `prepareWingRegistration()` 결과. `null` 이면 모달을 닫아 둔다. */
  draft: WingRegistrationDraft | null;
  isSubmitting: boolean;
  completion?: { suggestedExternalListingId?: string | null } | null;
  onCancel: () => void;
  onConfirm: (
    overrides: WingRegistrationOverrides,
    autoSubmit: boolean,
    channelAccountId: string,
  ) => void;
  onConfirmExternal?: (externalListingId: string) => void;
}) {
  const [overrides, setOverrides] = useState<WingRegistrationOverrides | null>(null);
  const [channelAccountId, setChannelAccountId] = useState('');
  const [externalListingId, setExternalListingId] = useState('');
  // ⚠️ 기본값은 반드시 OFF. 켜야만 확장이 WING 의 '상품등록' 버튼까지 누른다.
  const [autoSubmit, setAutoSubmit] = useState(false);

  // 초안이 바뀌면(=다른 상품을 열면) 입력을 그 상품의 기본값으로 되돌린다.
  // 이전 상품에서 고친 값이 남아 있으면 엉뚱한 상품에 실린다.
  // 자동 제출 옵트인도 함께 끈다 — 이전 상품에서 켠 값이 다음 상품에 남으면
  // 확인 없이 쿠팡에 등록되는 사고가 난다.
  useEffect(() => {
    setOverrides(draft ? { ...draft.overrides } : null);
    setChannelAccountId(draft?.channelAccountId ?? '');
    setAutoSubmit(false);
  }, [draft]);

  useEffect(() => {
    setExternalListingId(completion?.suggestedExternalListingId?.trim() ?? '');
  }, [completion?.suggestedExternalListingId]);

  if (!draft || !overrides) return null;

  if (completion) {
    const validExternalListingId = /^\d{6,20}$/.test(externalListingId.trim());
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="쿠팡 WING 등록 완료 확인"
        className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
      >
        <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <CheckCircle2 size={18} />
              </div>
              <h2 className="mt-3 text-base font-black text-slate-900">쿠팡 등록 완료 확인</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                WING에서 등록을 마친 뒤 발급된 등록상품ID를 입력하세요. 서버가 선택한 쿠팡 계정으로 실제 상품을 확인한 후 등록상품 목록에 반영합니다.
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

          <div className="space-y-3 px-5 py-5">
            <label className="block text-sm font-black text-slate-700">
              쿠팡 등록상품ID
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                value={externalListingId}
                onChange={(event) => setExternalListingId(event.target.value.replace(/\D/g, ''))}
                placeholder="예: 427011919"
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-black text-slate-900 outline-none transition focus:border-emerald-500"
              />
            </label>
            <p className="text-[11px] font-semibold leading-5 text-slate-500">
              WING 상품 조회 화면의 등록상품ID를 사용합니다. 브라우저 화면 값만 신뢰하지 않고 쿠팡 Open API로 계정과 상태를 다시 검증합니다.
            </p>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={() => onConfirmExternal?.(externalListingId.trim())}
              disabled={isSubmitting || !validExternalListingId || !onConfirmExternal}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              등록 완료 확인
            </button>
          </div>
        </div>
      </div>
    );
  }

  const errors = [
    ...validateWingRegistrationOverrides(overrides),
    ...(!channelAccountId ? ['쿠팡 WING 계정을 선택하세요.'] : []),
  ];
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
          <Field
            label="쿠팡 WING 계정"
            hint="실제 등록 및 등록상품 확인에 사용할 판매자 계정입니다."
          >
            <select
              aria-label="쿠팡 WING 계정"
              value={channelAccountId}
              onChange={(event) => setChannelAccountId(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-orange-400"
            >
              <option value="">계정을 선택하세요</option>
              {(draft.channelAccounts ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="WING 카테고리"
            hint="KidItem에서 사용하는 고정 카테고리 목록입니다. 카테고리 변경은 옵션·고시정보를 바꾸지 않습니다."
          >
            <select
              aria-label="WING 카테고리"
              value={overrides.categoryKey}
              onChange={(event) => patch({
                categoryKey: event.target.value as WingRegistrationOverrides['categoryKey'],
              })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-orange-400"
            >
              <option value="">카테고리를 선택하세요</option>
              {WING_CATEGORY_DEFINITIONS.map((definition) => (
                <option key={definition.key} value={definition.key}>
                  {definition.categoryCell}
                </option>
              ))}
            </select>
          </Field>

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

        <div className="space-y-3 border-t border-slate-200 px-5 py-4">
          {/*
            상품등록까지 자동 실행 — 옵트인.
            꺼져 있으면 지금처럼 폼만 채우고 WING 탭을 열어 둔 채 멈춘다(기존 동작).
            켜면 확장이 폼 하단 '상품등록'(수정 화면은 '수정 및 검수 요청')을 눌러
            **쿠팡에 실제로 등록**한다. 되돌리려면 쿠팡에서 직접 삭제해야 한다.
          */}
          <label
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition',
              autoSubmit
                ? 'border-rose-300 bg-rose-50'
                : 'border-slate-200 bg-slate-50 hover:bg-slate-100',
            )}
          >
            <input
              type="checkbox"
              checked={autoSubmit}
              disabled={isSubmitting}
              onChange={(event) => setAutoSubmit(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-rose-600"
            />
            <span className="text-[12px] leading-relaxed">
              <span className="block font-black text-slate-900">상품등록까지 자동 실행</span>
              <span
                className={cn(
                  'block font-semibold',
                  autoSubmit ? 'text-rose-700' : 'text-slate-500',
                )}
              >
                {autoSubmit ? (
                  <>
                    <AlertTriangle size={12} className="mr-1 inline align-text-bottom" />
                    켜짐 — 폼을 채운 뒤 <b>쿠팡에 실제로 등록됩니다.</b> 취소하려면 쿠팡에서 직접
                    삭제해야 합니다.
                  </>
                ) : (
                  '꺼짐 — 폼만 채우고 멈춥니다. WING 탭에서 내용을 확인한 뒤 직접 등록하세요.'
                )}
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2">
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
              onClick={() => onConfirm(overrides, autoSubmit, channelAccountId)}
              disabled={isSubmitting || errors.length > 0}
              className={cn(
                'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:opacity-50',
                autoSubmit ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#ff5a1f] hover:bg-[#ef4f18]',
              )}
            >
              {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Store size={15} />}
              {autoSubmit ? '확인하고 쿠팡에 등록' : '확인하고 WING 등록 시작'}
            </button>
          </div>
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
