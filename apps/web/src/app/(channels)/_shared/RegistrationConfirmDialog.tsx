'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { AlertTriangle, CheckCircle2, Loader2, Search, Send, X } from 'lucide-react';
import { ChannelAccountListItemSchema, type ChannelAccountListItem } from '@kiditem/shared/channel-account';
import { SellpiaOutOfStockToggle } from '@/components/SellpiaOutOfStockToggle';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { registrationTargetApi, registrationTargetKeys } from '@/lib/registration-target-api';
import { cn } from '@/lib/utils';
import type { MallFieldSpec, MallPublishAdapter } from './mall-publish-adapter';

/**
 * 몰 등록 확인 창(KID-321). 몰 이름을 모른다 — 어댑터가 확인 창을 요구할 때(`adapter.confirmation`)만 뜨고,
 * 그 몰의 계정 선택 · 어댑터가 선언한 칸 · 셀피아 상품 연결 · 폼 채우기와 등록 실행의 구분만 그린다.
 *
 * - 기본은 **폼 채우기**다(`submit: false`). [등록]까지 누르는 **등록 실행**은 사람이 켤 때만이다(KID-322).
 * - 셀피아 상품은 고른 것만 `adapterValues.sellpiaInventorySkuId` 로 넘긴다. 비워 두면 등록 실행 준비에서
 *   서버가 이름으로 찾고, 못 찾으면 이유와 함께 멈춘다.
 * - 값 검증은 어댑터의 것 하나다 — 화면이 몰별 조건을 다시 적지 않는다.
 */

export interface SellpiaSkuOption {
  /** 셀피아 재고 상품 id. 등록 실행 준비의 `sellpiaInventorySkuId` 가 이 값이다. */
  masterProductId: string;
  code: string;
  name: string;
  optionName: string | null;
  currentStock: number;
  recommendedQuantity?: number | null;
}

export interface RegistrationConfirmation {
  /** true 면 등록 실행(준비 → 시작 → [등록] → 결과), false 면 폼만 채운다. */
  submit: boolean;
  channelAccount: ChannelAccountListItem;
  /** 어댑터 칸(이번 송신 값)과 확인 창 칸의 값. */
  values: Record<string, string>;
  /** 등록 실행 준비에만 넘기는 값(셀피아 연결). 설정으로 저장하지 않는다. */
  adapterValues: Record<string, string>;
}

const ChannelAccountListSchema = z.array(ChannelAccountListItemSchema);

interface SellpiaSelection {
  sku: SellpiaSkuOption;
  quantity: number;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** 확인 창이 그리는 칸 — 어댑터의 이번 송신 칸과 확인 창 칸. 몰 고정값(템플릿)은 여기서 묻지 않는다. */
export function confirmationFields(adapter: MallPublishAdapter): MallFieldSpec[] {
  return [
    ...adapter.fields.filter((field) => field.origin === 'override'),
    ...(adapter.confirmation?.fields ?? []),
  ];
}

export function RegistrationConfirmDialog({
  adapter,
  salesProductId,
  isSubmitting,
  submissionError,
  onCancel,
  onConfirm,
  onSearchSellpia,
}: {
  /** 확인 창을 요구하는 어댑터. `null` 이거나 확인 창이 없는 어댑터면 닫혀 있다. */
  adapter: MallPublishAdapter | null;
  salesProductId: string | null;
  isSubmitting: boolean;
  submissionError?: string | null;
  onCancel: () => void;
  onConfirm: (input: RegistrationConfirmation) => void;
  onSearchSellpia?: (query: string, includeOutOfStock: boolean) => Promise<SellpiaSkuOption[]>;
}) {
  const confirmation = adapter?.confirmation ?? null;
  const open = Boolean(adapter && confirmation && salesProductId);
  const mallKey = adapter?.mallKey ?? '';

  const accountsQuery = useQuery({
    queryKey: queryKeys.channelAccounts.active(),
    queryFn: () => apiClient.getParsed('/api/channels/accounts', ChannelAccountListSchema),
    enabled: open,
  });
  const targetsQuery = useQuery({
    queryKey: registrationTargetKeys.list(salesProductId ?? ''),
    queryFn: () => registrationTargetApi.list(salesProductId!),
    enabled: open,
  });

  const accounts = useMemo(
    () => (accountsQuery.data ?? []).filter((account) => account.channel === mallKey),
    [accountsQuery.data, mallKey],
  );
  const mallTargets = useMemo(() => {
    const ids = new Set(accounts.map((account) => account.id));
    return (targetsQuery.data ?? []).filter((target) => ids.has(target.channelAccountId));
  }, [accounts, targetsQuery.data]);
  const savedInputs = useMemo(
    () => mallTargets
      .map((target) => recordValue(recordValue(recordValue(target.registrationInput).adapter)[mallKey]))
      .filter((input) => Object.keys(input).length > 0),
    [mallTargets, mallKey],
  );

  const defaultsQuery = useQuery({
    queryKey: queryKeys.registrationConfirmation.defaults(mallKey, salesProductId ?? '', savedInputs),
    queryFn: () => confirmation!.loadDefaults({ salesProductId: salesProductId!, savedInputs }),
    enabled: open && accountsQuery.isSuccess && targetsQuery.isSuccess,
    retry: false,
  });

  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [channelAccountId, setChannelAccountId] = useState('');
  const [submit, setSubmit] = useState(false);
  const [sellpia, setSellpia] = useState<SellpiaSelection | null>(null);
  const [sellpiaQuery, setSellpiaQuery] = useState('');
  const [sellpiaResults, setSellpiaResults] = useState<SellpiaSkuOption[]>([]);
  const [sellpiaError, setSellpiaError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [includeOutOfStock, setIncludeOutOfStock] = useState(false);

  // 다른 상품 · 다른 몰을 열면 입력을 그 상품의 기본값으로 되돌리고 등록 실행을 끈다 — 앞 상품에서 켠 값이
  // 남으면 확인 없이 몰에 올라간다.
  useEffect(() => {
    setValues(null);
    setSubmit(false);
    setSellpia(null);
    setSellpiaQuery('');
    setSellpiaResults([]);
    setSellpiaError(null);
    setIncludeOutOfStock(false);
  }, [salesProductId, mallKey]);

  useEffect(() => {
    if (!adapter || !defaultsQuery.data) return;
    const initial: Record<string, string> = {};
    for (const field of confirmationFields(adapter)) initial[field.key] = field.defaultValue;
    setValues({ ...initial, ...defaultsQuery.data.values });
  }, [adapter, defaultsQuery.data]);

  useEffect(() => {
    if (accounts.length === 1) {
      setChannelAccountId(accounts[0]!.id);
      return;
    }
    // 이 상품의 등록 대상이 한 계정에만 있으면 그 계정이다. 여럿이면 사람이 고른다.
    const held = [...new Set(mallTargets.map((target) => target.channelAccountId))];
    setChannelAccountId(held.length === 1 ? held[0]! : '');
  }, [accounts, mallTargets]);

  if (!open || !adapter || !confirmation) return null;

  const fields = confirmationFields(adapter);
  const account = accounts.find((candidate) => candidate.id === channelAccountId) ?? null;
  const loadError = accountsQuery.error ?? targetsQuery.error ?? defaultsQuery.error;
  const errors = values
    ? [
      ...(account ? [] : [`${adapter.mallName} 계정을 고르세요.`]),
      ...fields
        .filter((field) => field.required && !(values[field.key] ?? '').trim())
        .map((field) => `${field.label}을(를) 채우세요.`),
      ...confirmation.validate(values),
      ...(sellpia && (!Number.isSafeInteger(sellpia.quantity) || sellpia.quantity <= 0)
        ? ['판매 1개당 셀피아 차감수량은 1 이상의 정수여야 합니다.']
        : []),
    ]
    : [];
  const uniqueErrors = [...new Set(errors)];

  const searchSellpia = async (event: FormEvent) => {
    event.preventDefault();
    const query = sellpiaQuery.trim();
    if (!query) {
      setSellpiaError('셀피아 상품명이나 코드를 입력하세요.');
      return;
    }
    if (!onSearchSellpia) return;
    setSearching(true);
    setSellpiaError(null);
    try {
      const results = await onSearchSellpia(query, includeOutOfStock);
      setSellpiaResults(results);
      if (results.length === 0) setSellpiaError('검색 결과가 없습니다.');
    } catch (error) {
      setSellpiaError(error instanceof Error ? error.message : '셀피아 재고 검색에 실패했습니다.');
    } finally {
      setSearching(false);
    }
  };

  const confirm = () => {
    if (!values || !account || uniqueErrors.length > 0) return;
    onConfirm({
      submit,
      channelAccount: account,
      values,
      adapterValues: sellpia
        ? { sellpiaInventorySkuId: sellpia.sku.masterProductId, sellpiaQuantity: String(sellpia.quantity) }
        : {},
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${adapter.mallName} 등록 확인`}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-black text-slate-900">{adapter.mallName} 등록 확인</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              아래 값으로 {adapter.mallName} 상품등록 폼을 채웁니다. 등록 실행을 켜야 [등록]까지 누릅니다.
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
          {submissionError ? (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-[12px] font-bold leading-5 text-rose-700">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <p>{submissionError}</p>
            </div>
          ) : null}
          {loadError ? (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-bold text-rose-700">
              {loadError instanceof Error ? loadError.message : '확인 창을 준비하지 못했습니다.'}
            </p>
          ) : null}

          <Field label={`${adapter.mallName} 계정`} hint="실제 등록과 등록 확인에 쓸 판매자 계정입니다.">
            <select
              aria-label={`${adapter.mallName} 계정`}
              value={channelAccountId}
              onChange={(event) => setChannelAccountId(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-[var(--primary)]"
            >
              <option value="">계정을 선택하세요</option>
              {accounts.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </Field>

          {!values ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-500" role="status">
              <Loader2 size={14} className="animate-spin" />
              {adapter.mallName} 등록 값을 준비하고 있습니다.
            </p>
          ) : (
            <>
              {(defaultsQuery.data?.notes ?? []).length > 0 ? (
                <ul className="space-y-0.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {defaultsQuery.data!.notes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              ) : null}

              {confirmation.sellpiaMatch ? (
                <section
                  aria-label="셀피아 상품 연결"
                  className={cn('rounded-xl border p-4', sellpia ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50')}
                >
                  {sellpia ? (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[12px] font-black text-emerald-700">
                          <CheckCircle2 size={15} />
                          셀피아 상품 연결
                        </div>
                        <p className="mt-1 text-sm font-black text-slate-900">
                          <span className="font-mono">{sellpia.sku.code}</span> {sellpia.sku.name}
                          {sellpia.sku.optionName ? ` · ${sellpia.sku.optionName}` : ''}
                        </p>
                        <label className="mt-2 block text-[11px] font-black text-slate-700">
                          판매 1개당 셀피아 차감수량
                          <input
                            type="number"
                            min={1}
                            step={1}
                            aria-label="판매 1개당 셀피아 차감수량"
                            value={sellpia.quantity}
                            onChange={(event) => setSellpia({ ...sellpia, quantity: Number(event.target.value) })}
                            className="ml-2 h-8 w-20 rounded-md border border-emerald-200 bg-white px-2 text-sm font-black text-slate-900 outline-none"
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSellpia(null)}
                        disabled={isSubmitting}
                        className="shrink-0 rounded-md border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        연결 풀기
                      </button>
                    </div>
                  ) : (
                    <p className="text-[12px] font-semibold leading-5 text-slate-600">
                      셀피아 상품을 고르지 않으면 등록 실행 준비에서 서버가 상품명으로 찾습니다. 못 찾으면 이유와 함께 멈춥니다.
                    </p>
                  )}
                  <form onSubmit={searchSellpia} className="mt-3 flex gap-2">
                    <input
                      type="search"
                      aria-label="셀피아 재고 검색"
                      value={sellpiaQuery}
                      onChange={(event) => setSellpiaQuery(event.target.value)}
                      placeholder="상품명 또는 셀피아 코드"
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
                    />
                    <button
                      type="submit"
                      aria-label="셀피아 검색"
                      disabled={searching || !onSearchSellpia}
                      className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-[12px] font-black text-white hover:bg-slate-900 disabled:opacity-50"
                    >
                      {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                      검색
                    </button>
                  </form>
                  <SellpiaOutOfStockToggle checked={includeOutOfStock} onCheckedChange={setIncludeOutOfStock} className="mt-2" />
                  {sellpiaError ? <p className="mt-2 text-[11px] font-bold text-rose-600">{sellpiaError}</p> : null}
                  {sellpiaResults.length > 0 ? (
                    <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">
                      {sellpiaResults.map((sku) => (
                        <button
                          key={sku.masterProductId}
                          type="button"
                          aria-label={`${sku.code} ${sku.name} 선택`}
                          onClick={() => {
                            setSellpia({ sku, quantity: sku.recommendedQuantity ?? 1 });
                            setSellpiaResults([]);
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-slate-300 hover:bg-slate-50"
                        >
                          <span className="min-w-0">
                            <span className="block font-mono text-[11px] font-black text-slate-600">{sku.code}</span>
                            <span className="block truncate text-[12px] font-black text-slate-900">
                              {sku.name}{sku.optionName ? ` · ${sku.optionName}` : ''}
                            </span>
                          </span>
                          <span className="shrink-0 text-[11px] font-bold text-slate-500">현재고 {sku.currentStock}개</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((field) => (
                  <Field key={field.key} label={field.label} hint={field.help}>
                    {field.control === 'select' ? (
                      <select
                        aria-label={field.label}
                        value={values[field.key] ?? ''}
                        onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
                      >
                        {(field.options ?? []).map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        aria-label={field.label}
                        value={values[field.key] ?? ''}
                        onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
                      />
                    )}
                  </Field>
                ))}
              </div>
            </>
          )}

          {uniqueErrors.length > 0 ? (
            <ul className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-bold text-rose-700" aria-live="polite">
              {uniqueErrors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-slate-200 px-5 py-4">
          <label
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition',
              submit ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100',
            )}
          >
            <input
              type="checkbox"
              checked={submit}
              disabled={isSubmitting}
              onChange={(event) => setSubmit(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-rose-600"
            />
            <span className="text-[12px] leading-relaxed">
              <span className="block font-black text-slate-900">등록 실행까지 (몰에 실제로 등록)</span>
              <span className={cn('block font-semibold', submit ? 'text-rose-700' : 'text-slate-500')}>
                {submit
                  ? '켜짐 — 등록 실행을 열고 폼을 채운 뒤 [등록]을 누릅니다. 되돌리려면 몰에서 직접 지워야 합니다.'
                  : '꺼짐 — 폼만 채웁니다. 등록 실행을 열지 않고 [등록]을 누르지 않습니다.'}
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
              onClick={confirm}
              disabled={isSubmitting || !values || uniqueErrors.length > 0}
              className={cn(
                'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:opacity-50',
                submit ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 hover:bg-slate-800',
              )}
            >
              {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {submit ? '등록 실행' : '폼 채우기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <span className="mb-1 block text-[12px] font-black text-slate-700">{label}</span>
      {hint ? <span className="mb-1 block text-[11px] font-semibold text-slate-400">{hint}</span> : null}
      <div className="mt-auto">{children}</div>
    </div>
  );
}
