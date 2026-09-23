'use client';

import { Fragment, useMemo, useRef, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import { getMallPublishAdapter } from '@/app/(channels)/_shared/adapters';
import {
  executeTargetRegistration,
  isActiveTargetExecution,
} from '@/app/(channels)/_shared/target-registration-execution';
import {
  listRegistrationTargetExecutions,
  registrationExecutionKeys,
  targetRegistrationExecutionApi,
} from '@/app/(channels)/_shared/registration-execution-api';
import { isApiError } from '@/lib/api-error';
import { salesProductApi, salesProductKeys } from '@/lib/sales-product-api';
import { SUPPLY_PRICE_MALLS } from '../lib/mall-supply-price';
import { formatWon } from '../lib/sales-product-labels';
import { registrationTargetApi, registrationTargetKeys } from '@/lib/registration-target-api';
import { TargetExecutionConfirmationForm } from './TargetExecutionConfirmationForm';
import type {
  RegistrationTarget,
  RegistrationTargetCreateInput,
  RegistrationTargetUpdateInput,
  SalesProduct,
  TargetExecutionResult,
} from '@kiditem/shared/sales-product';

interface TargetOptionDraft {
  salesProductOptionId: string;
  selected: boolean;
  salePrice: string;
  normalPrice: string;
  supplyPrice: string;
}

interface TargetDraft {
  channelAccountId: string;
  displayName: string;
  registrationInput: string;
  options: TargetOptionDraft[];
}

type MallAccount = Awaited<ReturnType<typeof salesProductApi.mallAccounts>>[number];

function textPrice(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function draftOf(
  product: SalesProduct,
  target: RegistrationTarget | undefined,
  channelAccountId = target?.channelAccountId ?? '',
): TargetDraft {
  const selectedById = new Map(
    (target?.selectedOptions ?? product.options.filter((option) => option.supplyStatus !== 'unused').map((option) => ({
      salesProductOptionId: option.id,
      salePrice: null,
      normalPrice: null,
      supplyPrice: null,
    }))).map((option) => [option.salesProductOptionId, option]),
  );
  const selectedIds = [...selectedById.keys()];
  const optionIds = [
    ...selectedIds,
    ...product.options.map((option) => option.id).filter((id) => !selectedById.has(id)),
  ];
  const optionById = new Map(product.options.map((option) => [option.id, option]));

  return {
    channelAccountId,
    displayName: target?.displayName ?? '',
    registrationInput: JSON.stringify(target?.registrationInput ?? {}, null, 2),
    options: optionIds.flatMap((salesProductOptionId) => {
      const option = optionById.get(salesProductOptionId);
      if (!option) return [];
      const selected = selectedById.get(salesProductOptionId);
      return [{
        salesProductOptionId,
        selected: selected !== undefined,
        salePrice: textPrice(selected?.salePrice),
        normalPrice: textPrice(selected?.normalPrice),
        supplyPrice: textPrice(selected?.supplyPrice),
      }];
    }),
  };
}

function parseNullableMoney(value: string, label: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label}은(는) 0 이상의 정수여야 합니다.`);
  }
  return parsed;
}

function parseRegistrationInput(value: string): Record<string, unknown> {
  const text = value.trim();
  if (!text) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('provider document는 올바른 JSON이어야 합니다.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('provider document는 JSON 객체여야 합니다.');
  }
  return parsed as Record<string, unknown>;
}

function editableInput(draft: TargetDraft): Omit<RegistrationTargetCreateInput, 'salesProductId' | 'channelAccountId'> {
  return {
    displayName: draft.displayName.trim() || null,
    registrationInput: parseRegistrationInput(draft.registrationInput),
    selectedOptions: draft.options
      .filter((option) => option.selected)
      .map((option) => ({
        salesProductOptionId: option.salesProductOptionId,
        salePrice: parseNullableMoney(option.salePrice, '판매가 override'),
        normalPrice: parseNullableMoney(option.normalPrice, '정상가 override'),
        supplyPrice: parseNullableMoney(option.supplyPrice, '공급가 override'),
      })),
  };
}

function accountLabel(account: MallAccount | undefined, channelAccountId: string): string {
  return account?.mallName ?? `채널 계정 ${channelAccountId.slice(0, 8)}`;
}

function selectedCount(draft: TargetDraft): number {
  return draft.options.filter((option) => option.selected).length;
}

function newExecutionIntentKey(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  return cryptoApi?.randomUUID?.()
    ?? `target-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function moveSelectedOption(draft: TargetDraft, index: number, direction: -1 | 1): TargetDraft {
  const selectedIndexes = draft.options.flatMap((option, at) => option.selected ? [at] : []);
  const position = selectedIndexes.indexOf(index);
  const otherIndex = selectedIndexes[position + direction];
  if (position < 0 || otherIndex === undefined) return draft;
  const options = [...draft.options];
  [options[index], options[otherIndex]] = [options[otherIndex]!, options[index]!];
  return { ...draft, options };
}

function latestActiveExecution(history: readonly TargetExecutionResult[]): TargetExecutionResult | undefined {
  return [...history]
    .sort((left, right) => executionTimestamp(right.createdAt) - executionTimestamp(left.createdAt))
    .find((execution) => isActiveTargetExecution(execution));
}

function canStartPreparedExecution(execution: TargetExecutionResult | undefined): boolean {
  return execution?.status === 'prepared' && execution.providerOutcome === 'not_attempted';
}

function canManuallyConfirmExecution(execution: TargetExecutionResult): boolean {
  return execution.status === 'executing' || execution.status === 'reconciling';
}

function isCompositionExecution(execution: TargetExecutionResult | undefined): boolean {
  return execution?.payload.kind === 'composition_change';
}

function executionStatusLabel(execution: TargetExecutionResult): string {
  if (execution.status === 'prepared' && execution.providerOutcome === 'not_attempted') return '준비됨 · 외부 송신 대기';
  if (execution.status === 'executing') return '송신 중 · 결과 확인 필요';
  if (execution.status === 'reconciling') return '결과 확인 중 · 재송신하지 않음';
  if (execution.status === 'succeeded') return '등록 결과 확인됨';
  if (execution.status === 'failed' && execution.providerOutcome === 'definitive_failure') return '확정 실패';
  if (execution.status === 'cancelled') return '취소됨';
  return `${execution.status} · ${execution.providerOutcome}`;
}

function executionTimestamp(createdAt: TargetExecutionResult['createdAt']): number {
  if (!createdAt) return 0;
  const time = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  return Number.isNaN(time) ? 0 : time;
}

function executionTimeLabel(createdAt: TargetExecutionResult['createdAt']): string {
  if (!createdAt) return '';
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ko-KR');
}

function compositionListingLabel(
  listing: SalesProduct['channelListings'][number],
): string {
  const name = listing.displayName?.trim();
  return `${listing.mallName} · ${listing.externalId}${name ? ` · ${name}` : ''}`;
}

function compositionOptionLabel(
  product: SalesProduct,
  salesProductOptionId: string,
): string {
  const option = product.options.find((candidate) => candidate.id === salesProductOptionId);
  if (!option) return salesProductOptionId;
  return `${option.optionCode} · ${option.values.join(' / ') || '단품'}`;
}

function compositionApiError(error: unknown): string {
  return isApiError(error)
    ? error.detail
    : error instanceof Error ? error.message : '구성 변경 실행을 기록하지 못했습니다.';
}

interface SimpleOverrideDraft {
  targetId?: string;
  displayName: string;
  salePrice: string;
  supplyPrice: string;
  touched: { displayName: boolean; salePrice: boolean; supplyPrice: boolean };
}

function sharedPrice(values: readonly (number | null | undefined)[]): string {
  if (values.length === 0 || values.some((value) => value === null || value === undefined)) return '';
  const first = values[0];
  return values.every((value) => value === first) ? String(first) : '';
}

function simpleDraftOf(
  product: SalesProduct,
  target: RegistrationTarget | undefined,
): SimpleOverrideDraft {
  const resolved = target?.resolved.options ?? product.options
    .filter((option) => option.supplyStatus !== 'unused')
    .map((option) => ({ salePrice: option.salePrice, supplyPrice: null as number | null }));
  return {
    ...(target ? { targetId: target.id } : {}),
    displayName: target?.displayName ?? '',
    salePrice: sharedPrice(resolved.map((option) => option.salePrice)),
    supplyPrice: sharedPrice(resolved.map((option) => option.supplyPrice)),
    touched: { displayName: false, salePrice: false, supplyPrice: false },
  };
}

function simpleOverrideUpdate(
  target: RegistrationTarget,
  draft: SimpleOverrideDraft,
): RegistrationTargetUpdateInput {
  const displayName = draft.touched.displayName ? draft.displayName.trim() || null : target.displayName;
  const salePrice = draft.touched.salePrice ? parseNullableMoney(draft.salePrice, '판매가') : undefined;
  const supplyPrice = draft.touched.supplyPrice ? parseNullableMoney(draft.supplyPrice, '공급가') : undefined;
  return {
    expectedVersion: target.version,
    displayName,
    registrationInput: target.registrationInput,
    selectedOptions: target.selectedOptions.map((option) => ({
      ...option,
      ...(salePrice !== undefined || draft.touched.salePrice ? { salePrice: salePrice ?? null } : {}),
      ...(supplyPrice !== undefined || draft.touched.supplyPrice ? { supplyPrice: supplyPrice ?? null } : {}),
    })),
  };
}

/** Park Seonghun's original optional per-mall values; detailed target controls stay available below. */
export function ChannelOverridesSection({ product }: { product: SalesProduct }) {
  const queryClient = useQueryClient();
  const targets = useQuery({
    queryKey: registrationTargetKeys.list(product.id),
    queryFn: () => registrationTargetApi.list(product.id),
  });
  const accounts = useQuery({
    queryKey: salesProductKeys.mallAccounts(),
    queryFn: salesProductApi.mallAccounts,
    staleTime: 5 * 60_000,
  });
  const [drafts, setDrafts] = useState<Record<string, SimpleOverrideDraft>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // 상품 × 몰계정당 활성 등록 대상은 늘 하나다(ADR-0022) — 고를 것이 없다.
  const accountTargets = new Map<string, RegistrationTarget>();
  for (const target of targets.data ?? []) accountTargets.set(target.channelAccountId, target);

  const save = useMutation({
    mutationFn: async ({ account, draft }: { account: MallAccount; draft: SimpleOverrideDraft }) => {
      if (!draft.touched.displayName && !draft.touched.salePrice && !draft.touched.supplyPrice) {
        throw new Error('바뀐 몰별 값이 없습니다.');
      }
      const target = await registrationTargetApi.resolve({
        salesProductId: product.id,
        channelAccountId: account.channelAccountId,
      });
      return registrationTargetApi.update(target.id, simpleOverrideUpdate(target, draft));
    },
    onSuccess: (_saved, { account }) => {
      void queryClient.invalidateQueries({ queryKey: registrationTargetKeys.list(product.id) });
      setDrafts((current) => {
        const { [account.channelAccountId]: _savedDraft, ...rest } = current;
        return rest;
      });
      toast.success('몰별 값을 저장했습니다.');
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: registrationTargetKeys.list(product.id) });
      toast.error(isApiError(error) ? error.detail : error instanceof Error ? error.message : '몰별 값을 저장하지 못했습니다.');
    },
  });

  const draftFor = (accountId: string, target: RegistrationTarget | undefined) => {
    const saved = drafts[accountId];
    if (saved && saved.targetId === target?.id) return saved;
    return simpleDraftOf(product, target);
  };
  const patchDraft = (accountId: string, target: RegistrationTarget | undefined, patch: Partial<SimpleOverrideDraft>) => {
    const current = draftFor(accountId, target);
    setDrafts((values) => ({ ...values, [accountId]: { ...current, ...patch } }));
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">몰마다 다른 상품명과 가격을 선택 입력합니다. 비워 두면 공통 판매상품 값을 사용합니다.</p>
      {targets.isError || accounts.isError ? (
        <p className="text-sm text-red-600">몰별 값을 불러오지 못했습니다.</p>
      ) : accounts.isPending || targets.isPending ? (
        <p className="text-sm text-slate-400">몰별 값을 불러오는 중…</p>
      ) : (accounts.data ?? []).length === 0 ? (
        <p className="text-sm text-slate-400">연결된 쇼핑몰 계정이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="w-48 px-3 py-2 text-left font-semibold">쇼핑몰</th>
                <th className="px-2 py-2 text-left font-semibold">몰 상품명</th>
                <th className="w-32 px-2 py-2 text-left font-semibold">판매가</th>
                <th className="w-32 px-2 py-2 text-left font-semibold">공급가</th>
                <th className="w-20 px-3 py-2" aria-label="저장" />
              </tr>
            </thead>
            <tbody>
              {(accounts.data ?? []).map((account) => {
                const target = accountTargets.get(account.channelAccountId);
                const draft = draftFor(account.channelAccountId, target);
                const supportsSupply = SUPPLY_PRICE_MALLS.has(account.mallKey);
                const pending = save.isPending && save.variables?.account.channelAccountId === account.channelAccountId;
                const currentSalePrices = target?.resolved.options.map((option) => option.salePrice)
                  ?? product.options.filter((option) => option.supplyStatus !== 'unused').map((option) => option.salePrice);
                const salePricePlaceholder = new Set(currentSalePrices).size > 1 ? '옵션별 기본값 유지' : '공통 판매가';
                return (
                  <tr key={account.channelAccountId} className="border-b border-slate-100 align-top last:border-0">
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {account.mallName}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        aria-label={`${account.mallName} 몰 상품명`}
                        value={draft.displayName}
                        disabled={pending}
                        onChange={(event) => patchDraft(account.channelAccountId, target, {
                          displayName: event.target.value,
                          touched: { ...draft.touched, displayName: true },
                        })}
                        placeholder={product.name}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm disabled:bg-slate-50"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        aria-label={`${account.mallName} 판매가`}
                        inputMode="numeric"
                        value={draft.salePrice}
                        disabled={pending}
                        onChange={(event) => patchDraft(account.channelAccountId, target, {
                          salePrice: event.target.value,
                          touched: { ...draft.touched, salePrice: true },
                        })}
                        placeholder={salePricePlaceholder}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm tabular-nums disabled:bg-slate-50"
                      />
                    </td>
                    {supportsSupply ? (
                      <td className="px-2 py-1.5">
                        <input
                          aria-label={`${account.mallName} 공급가`}
                          inputMode="numeric"
                          value={draft.supplyPrice}
                          disabled={pending}
                          onChange={(event) => patchDraft(account.channelAccountId, target, {
                            supplyPrice: event.target.value,
                            touched: { ...draft.touched, supplyPrice: true },
                          })}
                          placeholder="필요한 경우 입력"
                          className="w-full rounded border border-slate-200 px-2 py-1 text-sm tabular-nums disabled:bg-slate-50"
                        />
                      </td>
                    ) : <td className="px-2 py-2 text-xs text-slate-300">—</td>}
                    <td className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        className="btn-secondary btn-sm inline-flex items-center gap-1 disabled:opacity-40"
                        disabled={pending || (!draft.touched.displayName && !draft.touched.salePrice && !draft.touched.supplyPrice)}
                        onClick={() => save.mutate({ account, draft })}
                      >
                        <Save size={13} aria-hidden />{pending ? '저장 중…' : '저장'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <details onToggle={(event) => setAdvancedOpen(event.currentTarget.open)} className="rounded-lg border border-slate-200 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-slate-500">추가 등록 설정</summary>
        {advancedOpen ? <div className="mt-3"><AdvancedChannelOverridesSettings product={product} /></div> : null}
      </details>
    </div>
  );
}

/**
 * 기존 몰 상품의 구성 변경 의도만 기록한다.
 *
 * 구성 변경은 현재 provider adapter가 지원하지 않는 수동 작업이다. 이
 * boundary는 Channels 실행 장부를 먼저 열고, 실제 몰 수정과 결과 확인은
 * 운영자가 별도로 수행하게 한다. 이름이나 배열 순서로 옵션을 추측하지
 * 않고, 화면에 보이는 UUID 선택만 request에 넣는다.
 */
function CompositionChangeLauncher({
  product,
  target,
  activeExecution,
  historyLoading,
  historyError,
}: {
  product: SalesProduct;
  target: RegistrationTarget;
  activeExecution: TargetExecutionResult | undefined;
  historyLoading: boolean;
  historyError: boolean;
}) {
  const queryClient = useQueryClient();
  const [listingId, setListingId] = useState('');
  const [optionMappings, setOptionMappings] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const inFlight = useRef(false);
  const intentKey = useRef<{ signature: string; key: string } | null>(null);
  const listings = useMemo(
    () => product.channelListings.filter((listing) => listing.channelAccountId === target.channelAccountId),
    [product.channelListings, target.channelAccountId],
  );
  const selectedListing = listings.find((listing) => listing.id === listingId);
  const targetOptionIds = useMemo(
    () => new Set(target.selectedOptions.map((option) => option.salesProductOptionId)),
    [target.selectedOptions],
  );
  const selectedProductOptions = useMemo(
    () => product.options.filter((option) => targetOptionIds.has(option.id)),
    [product.options, targetOptionIds],
  );
  const activeComposition = isCompositionExecution(activeExecution) ? activeExecution : undefined;
  const activeExecutionBlocksNewIntent = Boolean(activeExecution);
  const canStartPreparedComposition = Boolean(
    activeComposition && canStartPreparedExecution(activeComposition),
  );

  const start = useMutation({
    mutationFn: async () => {
      if (activeComposition) {
        if (!canStartPreparedComposition) return activeComposition;
        return targetRegistrationExecutionApi.start(activeComposition.executionId);
      }
      if (!selectedListing) throw new Error('구성 변경 대상 쇼핑몰 상품을 고르세요.');
      const transitions = selectedListing.options.flatMap((option) => {
        const salesProductOptionId = optionMappings[option.id]?.trim();
        return salesProductOptionId
          ? [{ channelListingOptionId: option.id, salesProductOptionId }]
          : [];
      });
      if (transitions.length === 0) throw new Error('변경할 기존 몰 옵션과 새 판매옵션을 하나 이상 선택하세요.');
      if (new Set(transitions.map((transition) => transition.salesProductOptionId)).size !== transitions.length) {
        throw new Error('같은 새 판매옵션을 여러 기존 몰 옵션에 연결할 수 없습니다.');
      }
      const signature = JSON.stringify({
        targetId: target.id,
        version: target.version,
        listingId: selectedListing.id,
        transitions,
      });
      if (intentKey.current?.signature !== signature) {
        intentKey.current = { signature, key: newExecutionIntentKey() };
      }
      const prepared = await targetRegistrationExecutionApi.prepare(target.id, {
        expectedVersion: target.version,
        kind: 'composition_change',
        channelListingId: selectedListing.id,
        optionTransitions: transitions,
        applyCompositionTemplate: false,
        idempotencyKey: intentKey.current.key,
      });
      // Composition changes deliberately stop at the execution fence. The
      // maySubmit bit is not permission to call a registration adapter here.
      return targetRegistrationExecutionApi.start(prepared.executionId);
    },
    onSuccess: (execution) => {
      inFlight.current = false;
      setStarted(true);
      setValidationError(null);
      void queryClient.invalidateQueries({ queryKey: registrationExecutionKeys.targetHistory(target.id) });
      if (execution.status === 'executing' || execution.status === 'reconciling') {
        toast.warning('구성 변경 실행을 기록했습니다. 실제 몰에서 수정한 뒤 확인 결과를 기록할 때까지 자동 재고 처리를 보류합니다.');
      }
    },
    onError: (error) => {
      inFlight.current = false;
      setValidationError(compositionApiError(error));
      void queryClient.invalidateQueries({ queryKey: registrationExecutionKeys.targetHistory(target.id) });
    },
  });

  const submit = () => {
    if (inFlight.current || start.isPending || started) return;
    if (historyLoading) {
      setValidationError('실행 이력을 확인하는 중입니다. 잠시 뒤 다시 시도하세요.');
      return;
    }
    if (historyError) {
      setValidationError('실행 이력을 확인하지 못해 새 구성 변경 실행을 열 수 없습니다.');
      return;
    }
    if (activeExecutionBlocksNewIntent && !canStartPreparedComposition) {
      setValidationError('진행 중인 실행이 있어 새 구성 변경 실행을 열 수 없습니다. 기존 실행 결과를 먼저 확인하세요.');
      return;
    }
    inFlight.current = true;
    setValidationError(null);
    start.mutate();
  };

  if (listings.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-sky-900">기존 몰 상품 구성 변경 · 수동 확인</p>
        <span className="text-[11px] text-sky-700">자동 옵션 연결·몰 송신 없음</span>
      </div>
      <p className="mt-1 text-[11px] leading-5 text-sky-800">
        같은 채널 계정의 실제 몰 상품과 기존 옵션을 직접 고른 뒤 실행 의도만 기록합니다. 실제 몰 수정은 운영자가 하고, 결과 확인 전까지 자동 재고 처리를 보류합니다.
      </p>
      {activeComposition ? (
        <div className="mt-2 rounded border border-sky-200 bg-white/70 px-2.5 py-2 text-[11px] text-sky-800">
          {canStartPreparedComposition
            ? '준비된 구성 변경 실행이 있습니다. 아래 버튼으로 한 번만 시작하세요.'
            : '구성 변경 실행이 진행 중입니다. 실제 몰 수정 후 아래 실행 이력의 확인 양식에 결과를 기록하세요.'}
          {canStartPreparedComposition && (
            <button
              type="button"
              className="ml-2 rounded bg-sky-700 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
              disabled={start.isPending || started}
              onClick={submit}
            >
              {start.isPending ? '기록 중…' : '준비된 구성 변경 시작'}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-sky-900">구성 변경 대상 쇼핑몰 상품</span>
              <select
                value={listingId}
                onChange={(event) => {
                  setListingId(event.target.value);
                  setOptionMappings({});
                  setValidationError(null);
                  setStarted(false);
                }}
                disabled={historyLoading || historyError || activeExecutionBlocksNewIntent || start.isPending}
                className="w-full rounded border border-sky-200 bg-white px-2 py-1.5 text-xs disabled:bg-slate-100"
                aria-label="구성 변경 대상 쇼핑몰 상품"
              >
                <option value="">상품을 고르세요</option>
                {listings.map((listing) => (
                  <option key={listing.id} value={listing.id}>{compositionListingLabel(listing)}</option>
                ))}
              </select>
            </label>
            <div className="rounded border border-sky-100 bg-white/70 px-2.5 py-2 text-[11px] text-sky-800">
              기존 몰 옵션과 새 판매상품 옵션은 각각 직접 선택해야 합니다. 이름이나 순서로 자동 매핑하지 않습니다.
            </div>
          </div>
          {selectedListing && (
            <div className="mt-3 space-y-2 rounded border border-sky-100 bg-white p-2.5">
              {selectedListing.options.length === 0 ? (
                <p className="text-[11px] text-slate-500">선택한 몰 상품에 이어진 옵션이 없습니다.</p>
              ) : selectedListing.options.map((listingOption) => (
                <label key={listingOption.id} className="grid grid-cols-1 items-center gap-1.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <span className="text-[11px] text-slate-600">
                    기존 몰 옵션 <span className="font-mono">{listingOption.externalOptionId}</span>
                    {listingOption.itemName ? ` · ${listingOption.itemName}` : ''}
                  </span>
                  <select
                    value={optionMappings[listingOption.id] ?? ''}
                    onChange={(event) => {
                      setOptionMappings((current) => ({ ...current, [listingOption.id]: event.target.value }));
                      setValidationError(null);
                      setStarted(false);
                    }}
                    disabled={historyLoading || historyError || activeExecutionBlocksNewIntent || start.isPending}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-xs disabled:bg-slate-100"
                    aria-label={`기존 몰 옵션 ${listingOption.externalOptionId} 새 판매상품 옵션`}
                  >
                    <option value="">변경하지 않음</option>
                    {selectedProductOptions.map((option) => (
                      <option key={option.id} value={option.id}>{compositionOptionLabel(product, option.id)}</option>
                    ))}
                  </select>
                </label>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-slate-500">선택된 매핑만 실행 의도에 포함됩니다.</span>
                <button
                  type="button"
                  className="rounded bg-sky-700 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                  disabled={historyLoading || historyError || activeExecutionBlocksNewIntent || start.isPending || started || !listingId}
                  onClick={submit}
                >
                  {start.isPending ? '기록 중…' : started ? '구성 변경 실행 기록됨' : '구성 변경 실행'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {validationError && <p role="alert" className="mt-2 text-[11px] text-red-700">{validationError}</p>}
    </div>
  );
}

/**
 * 등록대상(상품 × 채널 계정) 편집 — 한 계정에 여러 대상을 둘 수 있다.
 * 비어 있는 override는 null로 저장하고, 선택하지 않은 옵션은 payload에 넣지 않는다.
 */
function AdvancedChannelOverridesSettings({ product }: { product: SalesProduct }) {
  const queryClient = useQueryClient();
  const targets = useQuery({
    queryKey: registrationTargetKeys.list(product.id),
    queryFn: () => registrationTargetApi.list(product.id),
  });
  const accounts = useQuery({
    queryKey: salesProductKeys.mallAccounts(),
    queryFn: salesProductApi.mallAccounts,
    staleTime: 5 * 60_000,
  });
  const targetRows = targets.data ?? [];
  const executionHistoryQueries = useQueries({
    queries: targetRows.map((target) => ({
      queryKey: registrationExecutionKeys.targetHistory(target.id),
      queryFn: () => listRegistrationTargetExecutions(target.id),
      refetchInterval: (query: { state: { data?: unknown } }) => {
        const history = query.state.data as TargetExecutionResult[] | undefined;
        return history?.some((execution) => isActiveTargetExecution(execution)) ? 5_000 : false;
      },
      refetchIntervalInBackground: false,
    })),
  });
  const [drafts, setDrafts] = useState<Record<string, TargetDraft>>({});
  const [newDraft, setNewDraft] = useState<TargetDraft | null>(null);
  const [openTargetId, setOpenTargetId] = useState<string | 'new' | null>(null);
  // Keep the same intent across a report timeout or a user retry. A target
  // version change starts a new intent; an unresolved execution never does.
  const executionIntentKeys = useRef<Record<string, { version: number; key: string }>>({});

  const accountById = useMemo(
    () => new Map((accounts.data ?? []).map((account) => [account.channelAccountId, account])),
    [accounts.data],
  );

  const save = useMutation({
    mutationFn: ({ target, draft }: { target?: RegistrationTarget; draft: TargetDraft }) => {
      const editable = editableInput(draft);
      if (!draft.channelAccountId) throw new Error('채널 계정을 먼저 고르세요.');
      if (target) {
        const input: RegistrationTargetUpdateInput = { ...editable, expectedVersion: target.version };
        return registrationTargetApi.update(target.id, input);
      }
      const input: RegistrationTargetCreateInput = {
        ...editable,
        salesProductId: product.id,
        channelAccountId: draft.channelAccountId,
      };
      return registrationTargetApi.create(input);
    },
    onSuccess: (_next, { target }) => {
      void queryClient.invalidateQueries({ queryKey: registrationTargetKeys.list(product.id) });
      if (target) {
        setDrafts((current) => {
          const { [target.id]: _saved, ...rest } = current;
          return rest;
        });
      } else {
        setNewDraft(null);
      }
      setOpenTargetId(null);
      toast.success('등록 대상을 저장했습니다.');
    },
    onError: (error) => toast.error(isApiError(error) ? error.detail : error instanceof Error ? error.message : '등록 대상을 저장하지 못했습니다.'),
  });

  const execute = useMutation({
    mutationFn: ({ target, account }: { target: RegistrationTarget; account: MallAccount }) => {
      const history = executionHistoryQueries[targetRows.indexOf(target)]?.data ?? [];
      const activeExecution = latestActiveExecution(history);
      if (isCompositionExecution(activeExecution)) {
        throw new Error('구성 변경 실행은 외부 송신을 호출하지 않습니다. 아래 수동 확인 흐름을 사용하세요.');
      }
      const adapter = getMallPublishAdapter(account.mallKey);
      if (!adapter) throw new Error(`${account.mallName} 등록 어댑터가 없습니다.`);
      return executeTargetRegistration({
        targetId: target.id,
        expectedVersion: target.version,
        channelAccountId: target.channelAccountId,
        mallKey: account.mallKey,
        adapter,
        ...(activeExecution ? { existingExecution: activeExecution } : {
          idempotencyKey: (() => {
            const current = executionIntentKeys.current[target.id];
            if (current?.version === target.version) return current.key;
            const key = newExecutionIntentKey();
            executionIntentKeys.current[target.id] = { version: target.version, key };
            return key;
          })(),
        }),
      });
    },
    onSuccess: ({ execution, outcome }, { target }) => {
      void queryClient.invalidateQueries({ queryKey: registrationExecutionKeys.targetHistory(target.id) });
      // A definitive no-submit is a safe new intent boundary. Uncertain,
      // submitted, and approval states retain the key so a retry cannot send
      // the provider request again.
      if (execution.status === 'failed' && execution.providerOutcome === 'definitive_failure') {
        delete executionIntentKeys.current[target.id];
      }
      if (!outcome.ok && outcome.error) {
        toast.error(outcome.error);
        return;
      }
      if (execution.status === 'reconciling') {
        toast.warning('기존 등록 실행이 재조정 대기 중입니다. 외부 송신은 다시 하지 않았습니다.');
        return;
      }
      if (execution.status === 'succeeded') {
        toast.success('등록 실행 결과를 확인했습니다.');
        return;
      }
      toast.success('등록 실행 결과를 기록했습니다. 몰 화면의 승인 절차를 확인하세요.');
    },
    onError: (error, { target }) => {
      void queryClient.invalidateQueries({ queryKey: registrationExecutionKeys.targetHistory(target.id) });
      toast.error(isApiError(error) ? error.detail : error instanceof Error ? error.message : '등록 실행을 시작하지 못했습니다.');
    },
  });

  const removeDraft = () => {
    setNewDraft(null);
    setOpenTargetId(null);
  };

  if (targets.isError || accounts.isError) {
    return <p className="text-sm text-red-600">등록 대상을 불러오지 못했습니다.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        같은 채널 계정에도 등록 대상을 여러 개 둘 수 있습니다. 가격 override를 비워 두면 옵션 기본값을 사용하고, 선택하지 않은 옵션은 외부 송신에서 제외됩니다.
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="w-44 px-3 py-2 text-left font-semibold">쇼핑몰 계정</th>
              <th className="px-2 py-2 text-left font-semibold">등록 이름</th>
              <th className="w-32 px-2 py-2 text-center font-semibold">선택 옵션</th>
              <th className="w-20 px-2 py-2 text-center font-semibold">버전</th>
              <th className="w-28 px-3 py-2" aria-label="저장" />
            </tr>
          </thead>
          <tbody>
            {targets.isLoading && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">등록 대상을 불러오는 중</td></tr>
            )}
            {!targets.isLoading && targetRows.length === 0 && !newDraft && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">등록 대상이 없습니다.</td></tr>
            )}
            {targetRows.map((target, targetIndex) => {
              const draft = drafts[target.id] ?? draftOf(product, target);
              const open = openTargetId === target.id;
              const historyQuery = executionHistoryQueries[targetIndex];
              const history = historyQuery?.data ?? [];
              const orderedHistory = [...history].sort((left, right) => executionTimestamp(right.createdAt) - executionTimestamp(left.createdAt));
              const activeExecution = latestActiveExecution(history);
              const statusOnlyExecution = Boolean(activeExecution && !canStartPreparedExecution(activeExecution));
              const compositionExecution = isCompositionExecution(activeExecution);
              const hasSameAccountListing = product.channelListings.some(
                (listing) => listing.channelAccountId === target.channelAccountId,
              );
              const adapterAvailable = !compositionExecution
                && Boolean(getMallPublishAdapter(accountById.get(target.channelAccountId)?.mallKey ?? ''));
              return (
                <Fragment key={target.id}>
                  <tr className="border-b border-slate-100 align-top">
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {accountLabel(accountById.get(target.channelAccountId), target.channelAccountId)}
                      <span className="mt-0.5 block font-mono text-[10px] font-normal text-slate-400">{target.id.slice(0, 8)}</span>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={draft.displayName}
                        onChange={(event) => setDrafts((current) => ({ ...current, [target.id]: { ...draft, displayName: event.target.value } }))}
                        placeholder={product.name}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                        aria-label={`${accountLabel(accountById.get(target.channelAccountId), target.channelAccountId)} 등록 이름`}
                      />
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums text-slate-600">
                      <button type="button" className="text-purple-700 hover:underline" onClick={() => setOpenTargetId(open ? null : target.id)}>
                        {selectedCount(draft)} / {product.options.length}
                      </button>
                    </td>
                    <td className="px-2 py-2 text-center text-xs tabular-nums text-slate-500">v{target.version}</td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          className="btn-secondary btn-sm inline-flex items-center gap-1 disabled:opacity-40"
                          disabled={execute.isPending || compositionExecution || historyQuery?.isLoading || historyQuery?.isFetching || historyQuery?.isError || !accountById.get(target.channelAccountId) || !adapterAvailable}
                          onClick={() => {
                            const account = accountById.get(target.channelAccountId);
                            if (account && !compositionExecution) execute.mutate({ target, account });
                          }}
                          title={compositionExecution
                            ? '구성 변경 실행은 실제 몰에서 수동으로 처리하고 아래 확인 흐름으로 결과를 기록합니다.'
                            : statusOnlyExecution
                            ? '진행 중인 등록 실행 상태를 확인합니다. 외부 송신은 다시 하지 않습니다.'
                            : activeExecution
                              ? '준비된 등록 실행을 이어갑니다. 서버가 허용할 때만 외부 송신합니다.'
                            : '저장된 등록 대상 snapshot으로 외부 송신'}
                        >
                          <Send size={13} aria-hidden />
                          {execute.isPending && execute.variables?.target.id === target.id
                            ? '확인 중…'
                            : compositionExecution ? '구성 변경 확인 대기'
                            : statusOnlyExecution ? '상태 확인' : activeExecution ? '계속 실행' : '외부 송신'}
                        </button>
                        <button
                          type="button"
                          className="btn-primary btn-sm disabled:opacity-40"
                          disabled={!drafts[target.id] || save.isPending}
                          onClick={() => save.mutate({ target, draft })}
                        >
                          저장
                        </button>
                      </div>
                    </td>
                  </tr>
                  {(historyQuery?.isLoading || historyQuery?.isError || history.length > 0 || hasSameAccountListing) && (
                    <tr className="border-b border-slate-100 bg-slate-50/40">
                      <td colSpan={5} className="px-3 py-2.5">
                        <CompositionChangeLauncher
                          product={product}
                          target={target}
                          activeExecution={activeExecution}
                          historyLoading={Boolean(historyQuery?.isLoading || historyQuery?.isFetching)}
                          historyError={Boolean(historyQuery?.isError)}
                        />
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-[11px] font-semibold text-slate-500">최근 등록 실행</p>
                          {activeExecution && (
                            <p className="text-[11px] text-amber-700">진행 중인 실행은 상태만 확인하며 재송신하지 않습니다.</p>
                          )}
                        </div>
                        {historyQuery?.isLoading ? (
                          <p className="mt-1 text-[11px] text-slate-400">실행 이력을 불러오는 중…</p>
                        ) : historyQuery?.isError ? (
                          <p className="mt-1 text-[11px] text-red-600">실행 이력을 확인하지 못해 외부 송신을 잠시 막았습니다.</p>
                        ) : (
                          <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                            {orderedHistory.slice(0, 5).map((execution) => (
                              <li key={execution.executionId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className={execution.status === 'succeeded' ? 'text-emerald-700' : execution.status === 'failed' ? 'text-red-700' : 'text-amber-700'}>
                                  {executionStatusLabel(execution)}
                                </span>
                                {executionTimeLabel(execution.createdAt) && (
                                  <span className="text-slate-400">{executionTimeLabel(execution.createdAt)}</span>
                                )}
                                <span className="font-mono text-[10px] text-slate-400">{execution.executionId.slice(0, 8)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {!historyQuery?.isLoading && !historyQuery?.isError && orderedHistory
                          .filter((execution) => canManuallyConfirmExecution(execution))
                          .map((execution) => (
                            <TargetExecutionConfirmationForm key={execution.executionId} execution={execution} />
                          ))}
                      </td>
                    </tr>
                  )}
                  {open && (
                    <tr className="border-b border-slate-200 bg-slate-50/60">
                      <td colSpan={5} className="px-3 py-4">
                        <TargetEditor
                          product={product}
                          draft={draft}
                          onChange={(next) => setDrafts((current) => ({ ...current, [target.id]: next }))}
                          onSave={() => save.mutate({ target, draft })}
                          saving={save.isPending}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {newDraft && (
              <>
                <tr className="border-b border-slate-100 align-top">
                  <td className="px-3 py-2 font-medium text-slate-800">
                    {accountLabel(accountById.get(newDraft.channelAccountId), newDraft.channelAccountId)}
                    <span className="mt-0.5 block text-[10px] font-normal text-purple-600">새 등록 대상</span>
                  </td>
                  <td className="px-2 py-1.5 text-slate-500">{newDraft.displayName || product.name}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-slate-600">{selectedCount(newDraft)} / {product.options.length}</td>
                  <td className="px-2 py-2 text-center text-xs text-slate-400">—</td>
                  <td className="px-3 py-1.5 text-right">
                    <button type="button" className="btn-secondary btn-sm" onClick={removeDraft}>취소</button>
                  </td>
                </tr>
                {openTargetId === 'new' && (
                  <tr className="border-b border-slate-200 bg-slate-50/60">
                    <td colSpan={5} className="px-3 py-4">
                      <TargetEditor
                        product={product}
                        draft={newDraft}
                        onChange={setNewDraft}
                        onSave={() => save.mutate({ draft: newDraft })}
                        saving={save.isPending}
                        onCancel={removeDraft}
                      />
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
      {accounts.data && accounts.data.length > 0 && !newDraft && (
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <Plus size={14} aria-hidden />
          등록 대상 추가
          <select
            value=""
            onChange={(event) => {
              const channelAccountId = event.target.value;
              if (!channelAccountId) return;
              setNewDraft(draftOf(product, undefined, channelAccountId));
              setOpenTargetId('new');
            }}
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
          >
            <option value="">채널 계정 고르기</option>
            {accounts.data.map((account) => (
              <option key={account.channelAccountId} value={account.channelAccountId}>{account.mallName}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function TargetEditor({
  product,
  draft,
  onChange,
  onSave,
  saving,
  onCancel,
}: {
  product: SalesProduct;
  draft: TargetDraft;
  onChange: (next: TargetDraft) => void;
  onSave: () => void;
  saving: boolean;
  onCancel?: () => void;
}) {
  const documentError = useMemo(() => {
    try {
      parseRegistrationInput(draft.registrationInput);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'provider document를 확인하세요.';
    }
  }, [draft.registrationInput]);
  const canSave = !documentError;
  const selected = new Set(draft.options.filter((option) => option.selected).map((option) => option.salesProductOptionId));
  const optionById = new Map(product.options.map((option) => [option.id, option]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">등록 이름 override</span>
          <input
            value={draft.displayName}
            onChange={(event) => onChange({ ...draft, displayName: event.target.value })}
            placeholder={product.name}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
          />
          <span className="mt-1 block text-[11px] text-slate-400">비워 두면 판매상품 이름을 사용합니다.</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">provider document (JSON)</span>
          <textarea
            value={draft.registrationInput}
            onChange={(event) => onChange({ ...draft, registrationInput: event.target.value })}
            rows={4}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs"
            aria-label="provider document"
          />
          {documentError && <span className="mt-1 block text-xs text-red-600">{documentError}</span>}
        </label>
      </div>
      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-semibold text-slate-600">외부 송신 옵션 · {selected.size}개 선택</p>
          <p className="text-[11px] text-slate-400">가격 override를 비워 두면 각 옵션의 기본값을 그대로 사용합니다.</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="w-14 px-2 py-2 text-center font-semibold">선택</th>
                <th className="px-2 py-2 text-left font-semibold">옵션</th>
                <th className="w-32 px-2 py-2 text-right font-semibold">판매가 override</th>
                <th className="w-32 px-2 py-2 text-right font-semibold">정상가 override</th>
                <th className="w-32 px-2 py-2 text-right font-semibold">공급가 override</th>
                <th className="w-20 px-2 py-2 text-center font-semibold">순서</th>
              </tr>
            </thead>
            <tbody>
              {draft.options.map((row, index) => {
                const option = optionById.get(row.salesProductOptionId);
                if (!option) return null;
                const selectedIndex = draft.options.slice(0, index).filter((item) => item.selected).length;
                const selectedTotal = selected.size;
                const update = (patch: Partial<TargetOptionDraft>) => onChange({
                  ...draft,
                  options: draft.options.map((item) => item.salesProductOptionId === row.salesProductOptionId ? { ...item, ...patch } : item),
                });
                return (
                  <tr key={row.salesProductOptionId} className={`border-b border-slate-100 ${row.selected ? '' : 'bg-slate-50 text-slate-400'}`}>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(event) => update({ selected: event.target.checked })}
                        aria-label={`${option.optionCode} 외부 송신 선택`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <span className="font-mono text-xs text-slate-500">{option.optionCode}</span>
                      <span className="ml-2 text-slate-700">{option.values.join(' / ') || '단품'}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-400">
                        기본 판매가 {formatWon(option.salePrice)} · 정상가 {option.normalPrice === null ? '—' : formatWon(option.normalPrice)}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        value={row.salePrice}
                        disabled={!row.selected}
                        onChange={(event) => update({ salePrice: event.target.value })}
                        placeholder={String(option.salePrice)}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-right tabular-nums disabled:bg-slate-100"
                        aria-label={`${option.optionCode} 판매가 override`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        value={row.normalPrice}
                        disabled={!row.selected}
                        onChange={(event) => update({ normalPrice: event.target.value })}
                        placeholder={option.normalPrice === null ? '없음' : String(option.normalPrice)}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-right tabular-nums disabled:bg-slate-100"
                        aria-label={`${option.optionCode} 정상가 override`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        value={row.supplyPrice}
                        disabled={!row.selected}
                        onChange={(event) => update({ supplyPrice: event.target.value })}
                        placeholder="미지정"
                        className="w-full rounded border border-slate-200 px-2 py-1 text-right tabular-nums disabled:bg-slate-100"
                        aria-label={`${option.optionCode} 공급가 override`}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {row.selected && (
                        <span className="inline-flex items-center gap-0.5">
                          <button
                            type="button"
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                            disabled={selectedIndex <= 0}
                            onClick={() => onChange(moveSelectedOption(draft, index, -1))}
                            aria-label={`${option.optionCode} 위로`}
                          ><ArrowUp size={13} aria-hidden /></button>
                          <button
                            type="button"
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                            disabled={selectedIndex >= selectedTotal - 1}
                            onClick={() => onChange(moveSelectedOption(draft, index, 1))}
                            aria-label={`${option.optionCode} 아래로`}
                          ><ArrowDown size={13} aria-hidden /></button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && <button type="button" className="btn-secondary btn-sm" onClick={onCancel}>취소</button>}
        <button type="button" className="btn-primary btn-sm inline-flex items-center gap-1 disabled:opacity-40" disabled={!canSave || saving} onClick={onSave}>
          <Save size={14} aria-hidden />
          {saving ? '저장하는 중…' : '등록 대상 저장'}
        </button>
      </div>
    </div>
  );
}
