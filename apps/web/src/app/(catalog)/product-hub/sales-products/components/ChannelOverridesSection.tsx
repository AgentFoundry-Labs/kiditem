'use client';

import { Fragment, useMemo, useRef, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Save, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getMallPublishAdapter } from '@/app/(channels)/_shared/adapters';
import {
  executeTargetRegistration,
  isActiveTargetExecution,
} from '@/app/(channels)/_shared/target-registration-execution';
import {
  registrationExecutionKeys,
  targetRegistrationExecutionApi,
} from '@/app/(channels)/_shared/registration-execution-api';
import { RegistrationStateBadge } from '@/app/(channels)/_shared/components/RegistrationStateBadge';
import { useRegistrationState } from '@/app/(channels)/_shared/use-registration-state';
import { isApiError } from '@/lib/api-error';
import { salesProductApi, salesProductKeys } from '@/lib/sales-product-api';
import { SUPPLY_PRICE_MALLS } from '../lib/mall-supply-price';
import { mallFieldsDraftOf, mallFieldsFromDraft, type MallFieldsDraft } from '../lib/mall-fields-draft';
import { formatWon } from '../lib/sales-product-labels';
import { registrationTargetApi, registrationTargetKeys } from '@/lib/registration-target-api';
import { TargetExecutionConfirmationForm } from './TargetExecutionConfirmationForm';
import {
  type RegistrationAccountState,
  type RegistrationMallInput,
  type RegistrationTarget,
  type RegistrationTargetUpdateInput,
  type SalesProduct,
  type TargetExecutionResult,
} from '@kiditem/shared/sales-product';

/** 등록 대상은 옵션을 고르기만 한다 — 이름 · 가격은 판매 상품 한 곳에 있다(KID-313 W2). */
interface TargetOptionDraft {
  salesProductOptionId: string;
  selected: boolean;
}

interface TargetDraft {
  channelAccountId: string;
  /** 몰 카테고리와 어댑터 값은 이 편집기가 고치지 않는다 — 그대로 저장한다(카테고리는 위 표가 고친다). */
  mallCategory: RegistrationMallInput['mallCategory'];
  adapter: RegistrationMallInput['adapter'];
  /** 저장돼 있던 몰 전용 칸 — 고치지 않은 글자 아닌 값을 그대로 두는 기준이다. */
  storedMallFields: RegistrationMallInput['mallFields'];
  mallFields: MallFieldsDraft;
  selectedThumbnailAssetId: string | null;
  selectedDetailPageRevisionId: string | null;
  options: TargetOptionDraft[];
}

const EMPTY_MALL_INPUT: RegistrationMallInput = { mallCategory: null, mallFields: {}, adapter: {} };

type MallAccount = Awaited<ReturnType<typeof salesProductApi.mallAccounts>>[number];

function draftOf(
  product: SalesProduct,
  target: RegistrationTarget | undefined,
  channelAccountId = target?.channelAccountId ?? '',
): TargetDraft {
  const selectedById = new Map(
    (target?.selectedOptions ?? product.options.filter((option) => option.supplyStatus !== 'unused').map((option) => ({
      salesProductOptionId: option.id,
    }))).map((option) => [option.salesProductOptionId, option]),
  );
  const selectedIds = [...selectedById.keys()];
  const optionIds = [
    ...selectedIds,
    ...product.options.map((option) => option.id).filter((id) => !selectedById.has(id)),
  ];
  const optionById = new Map(product.options.map((option) => [option.id, option]));

  const input = target?.registrationInput ?? EMPTY_MALL_INPUT;
  return {
    channelAccountId,
    mallCategory: input.mallCategory,
    adapter: input.adapter,
    storedMallFields: input.mallFields,
    mallFields: mallFieldsDraftOf(input.mallFields),
    selectedThumbnailAssetId: target?.selectedThumbnailAssetId ?? null,
    selectedDetailPageRevisionId: target?.selectedDetailPageRevisionId ?? null,
    options: optionIds.flatMap((salesProductOptionId) => {
      if (!optionById.has(salesProductOptionId)) return [];
      return [{ salesProductOptionId, selected: selectedById.has(salesProductOptionId) }];
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

function editableInput(draft: TargetDraft): Omit<RegistrationTargetUpdateInput, 'expectedVersion'> {
  const mallFields = mallFieldsFromDraft(draft.mallFields, draft.storedMallFields);
  if (!mallFields.ok) throw new Error(mallFields.error);
  return {
    registrationInput: { mallCategory: draft.mallCategory, mallFields: mallFields.value, adapter: draft.adapter },
    selectedThumbnailAssetId: draft.selectedThumbnailAssetId,
    selectedDetailPageRevisionId: draft.selectedDetailPageRevisionId,
    selectedOptions: draft.options
      .filter((option) => option.selected)
      .map((option) => ({ salesProductOptionId: option.salesProductOptionId })),
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

function canStartPreparedExecution(execution: TargetExecutionResult | undefined): boolean {
  return execution?.status === 'prepared' && execution.providerOutcome === 'not_attempted';
}

function canManuallyConfirmExecution(execution: TargetExecutionResult): boolean {
  return execution.status === 'executing' || execution.status === 'reconciling';
}

function isCompositionExecution(execution: TargetExecutionResult | undefined): boolean {
  return execution?.payload.kind === 'composition_change';
}

function executionStatusLabel(execution: { status: string; providerOutcome: string }): string {
  if (execution.status === 'prepared' && execution.providerOutcome === 'not_attempted') return '준비됨 · 외부 송신 대기';
  if (execution.status === 'executing') return '송신 중 · 결과 확인 필요';
  if (execution.status === 'reconciling') return '결과 확인 중 · 재송신하지 않음';
  if (execution.status === 'succeeded') return '등록 결과 확인됨';
  if (execution.status === 'failed' && execution.providerOutcome === 'definitive_failure') return '확정 실패';
  if (execution.status === 'cancelled') return '취소됨';
  return `${execution.status} · ${execution.providerOutcome}`;
}

function executionTimeLabel(createdAt: string | null): string {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ko-KR');
}

const EXECUTION_KIND_LABEL: Record<string, string> = {
  register: '등록',
  update: '수정',
  composition_change: '구성 변경',
};

/** 등록 상태의 근거가 된 마지막 실행 한 줄 — 등록 상태 reader 가 준 값이다(KID-320). */
function lastExecutionLine(account: RegistrationAccountState | undefined): string | null {
  const execution = account?.lastExecution;
  if (!execution) return null;
  const kind = EXECUTION_KIND_LABEL[execution.kind] ?? execution.kind;
  const time = executionTimeLabel(execution.createdAt);
  return [`${kind} · ${executionStatusLabel(execution)}`, time].filter(Boolean).join(' · ');
}

/** 계정 줄: 등록 상태 배지와 마지막 실행 한 줄. 재전송이 필요하면 몰에 올라간 상품의 수정 실행으로 보낸다. */
function AccountRegistrationState({ account }: { account: RegistrationAccountState | undefined }) {
  const line = lastExecutionLine(account);
  return (
    <div className="space-y-0.5">
      <RegistrationStateBadge account={account ?? UNREGISTERED} />
      {line && <p className="text-[11px] text-slate-500">{line}</p>}
      {account?.changedSinceRegistration && (
        <a href="#listings" className="block text-[11px] font-medium text-orange-700 hover:underline">
          몰에 올라간 상품에서 다시 보내기
        </a>
      )}
    </div>
  );
}

/** 준비됨 · 송신 중 · 결과 확인 중 — `isActiveTargetExecution` 과 같은 규칙을 reader 의 글자 상태에 쓴다. */
function isLiveExecutionStatus(status: string): boolean {
  return isActiveTargetExecution({ status: status as TargetExecutionResult['status'], providerOutcome: 'not_attempted' });
}

const UNREGISTERED = { state: 'unregistered', soldOut: false, changedSinceRegistration: false } as const;

/** 등록 설정(대상) 하나의 등록 상태 — 대상 id 로, 없으면 계정으로 찾는다. */
function accountStateFor(
  accounts: readonly RegistrationAccountState[],
  target: Pick<RegistrationTarget, 'id' | 'channelAccountId'> | undefined,
  channelAccountId: string,
): RegistrationAccountState | undefined {
  return (target ? accounts.find((account) => account.registrationTargetId === target.id) : undefined)
    ?? accounts.find((account) => account.channelAccountId === channelAccountId);
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

/** 몰마다 고르는 값: 몰 카테고리와 몰 공급가(`mallFields.supplyPrice`). 판매가는 판매상품 값이다. */
interface SimpleOverrideDraft {
  targetId?: string;
  category: string;
  supplyPrice: string;
  touched: { category: boolean; supplyPrice: boolean };
}

function simpleDraftOf(target: RegistrationTarget | undefined): SimpleOverrideDraft {
  const supplyPrice = target?.registrationInput.mallFields.supplyPrice;
  return {
    ...(target ? { targetId: target.id } : {}),
    category: target?.registrationInput.mallCategory?.key ?? '',
    supplyPrice: supplyPrice === null || supplyPrice === undefined ? '' : String(supplyPrice),
    touched: { category: false, supplyPrice: false },
  };
}

function simpleOverrideUpdate(
  target: RegistrationTarget,
  draft: SimpleOverrideDraft,
): RegistrationTargetUpdateInput {
  const input = target.registrationInput;
  const category = draft.category.trim();
  const mallCategory = draft.touched.category
    ? (category ? { key: category, label: null } : null)
    : input.mallCategory;
  const { supplyPrice: _currentSupplyPrice, ...otherFields } = input.mallFields;
  const supplyPrice = draft.touched.supplyPrice ? parseNullableMoney(draft.supplyPrice, '공급가') : undefined;
  const mallFields = !draft.touched.supplyPrice
    ? input.mallFields
    : supplyPrice === null || supplyPrice === undefined ? otherFields : { ...otherFields, supplyPrice: String(supplyPrice) };
  return {
    expectedVersion: target.version,
    registrationInput: { ...input, mallCategory, mallFields },
    selectedThumbnailAssetId: target.selectedThumbnailAssetId,
    selectedDetailPageRevisionId: target.selectedDetailPageRevisionId,
    selectedOptions: target.selectedOptions,
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
  const registration = useRegistrationState(product.id);
  const [drafts, setDrafts] = useState<Record<string, SimpleOverrideDraft>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // 상품 × 몰계정당 활성 등록 대상은 늘 하나다(ADR-0022) — 고를 것이 없다.
  const accountTargets = new Map<string, RegistrationTarget>();
  for (const target of targets.data ?? []) accountTargets.set(target.channelAccountId, target);

  const save = useMutation({
    mutationFn: async ({ account, draft }: { account: MallAccount; draft: SimpleOverrideDraft }) => {
      if (!draft.touched.category && !draft.touched.supplyPrice) {
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
    return simpleDraftOf(target);
  };
  const patchDraft = (accountId: string, target: RegistrationTarget | undefined, patch: Partial<SimpleOverrideDraft>) => {
    const current = draftFor(accountId, target);
    setDrafts((values) => ({ ...values, [accountId]: { ...current, ...patch } }));
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">몰마다 카테고리와 공급가만 따로 정합니다. 상품명 · 판매가 · 상세는 판매상품 한 곳에서 고칩니다.</p>
      {targets.isError || accounts.isError ? (
        <p className="text-sm text-red-600">몰별 값을 불러오지 못했습니다.</p>
      ) : accounts.isPending || targets.isPending ? (
        <p className="text-sm text-slate-400">몰별 값을 불러오는 중…</p>
      ) : (accounts.data ?? []).length === 0 ? (
        <p className="text-sm text-slate-400">연결된 쇼핑몰 계정이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="w-48 px-3 py-2 text-left font-semibold">쇼핑몰</th>
                <th className="w-44 px-2 py-2 text-left font-semibold">등록 상태</th>
                <th className="px-2 py-2 text-left font-semibold">몰 카테고리</th>
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
                const salePriceLabel = new Set(currentSalePrices).size > 1
                  ? '옵션별 판매가'
                  : currentSalePrices[0] === null || currentSalePrices[0] === undefined ? '—' : formatWon(currentSalePrices[0]);
                return (
                  <tr key={account.channelAccountId} className="border-b border-slate-100 align-top last:border-0">
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {account.mallName}
                    </td>
                    <td className="px-2 py-2">
                      <AccountRegistrationState
                        account={accountStateFor(registration.accounts, target, account.channelAccountId)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        aria-label={`${account.mallName} 몰 카테고리`}
                        value={draft.category}
                        disabled={pending}
                        onChange={(event) => patchDraft(account.channelAccountId, target, {
                          category: event.target.value,
                          touched: { ...draft.touched, category: true },
                        })}
                        placeholder="사방넷 분류 또는 몰 분류 경로"
                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm disabled:bg-slate-50"
                      />
                    </td>
                    <td className="px-2 py-2 text-sm tabular-nums text-slate-600" aria-label={`${account.mallName} 판매가`}>
                      {salePriceLabel}
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
                        disabled={pending || (!draft.touched.category && !draft.touched.supplyPrice)}
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
  onRecorded,
}: {
  product: SalesProduct;
  target: RegistrationTarget;
  activeExecution: TargetExecutionResult | undefined;
  /** 등록 상태(과 살아 있는 실행)를 아직 읽는 중이다. */
  historyLoading: boolean;
  historyError: boolean;
  /** 실행을 기록했거나 거절됐을 때 — 등록 상태를 다시 읽게 한다. */
  onRecorded: () => void;
}) {
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
      onRecorded();
      if (execution.status === 'executing' || execution.status === 'reconciling') {
        toast.warning('구성 변경 실행을 기록했습니다. 실제 몰에서 수정한 뒤 확인 결과를 기록할 때까지 자동 재고 처리를 보류합니다.');
      }
    },
    onError: (error) => {
      inFlight.current = false;
      setValidationError(compositionApiError(error));
      onRecorded();
    },
  });

  const submit = () => {
    if (inFlight.current || start.isPending || started) return;
    if (historyLoading) {
      setValidationError('등록 상태를 확인하는 중입니다. 잠시 뒤 다시 시도하세요.');
      return;
    }
    if (historyError) {
      setValidationError('등록 상태를 확인하지 못해 새 구성 변경 실행을 열 수 없습니다.');
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
            : '구성 변경 실행이 진행 중입니다. 실제 몰 수정 후 아래 확인 양식에 결과를 기록하세요.'}
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
 * 등록대상(상품 × 채널 계정) 편집 — 상품 × 계정당 등록 대상은 하나다(ADR-0022).
 * 선택하지 않은 옵션은 payload에 넣지 않는다.
 *
 * 등록 상태는 Channels 등록 상태 reader 하나(`useRegistrationState`)가 계정별로 답한다(KID-320) — 대상마다
 * 실행 이력을 읽고 폴링하지 않는다. reader 가 살아 있는 실행을 가리키면 그 실행 하나만 읽어 이어 가기 ·
 * 결과 확인 양식에 쓴다(상태가 바뀔 때만 다시 읽는다).
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
  const registration = useRegistrationState(product.id);
  const rowAccounts = targetRows.map((target) => accountStateFor(registration.accounts, target, target.channelAccountId));
  const liveExecutionQueries = useQueries({
    queries: rowAccounts.map((account) => {
      const execution = account?.lastExecution && isLiveExecutionStatus(account.lastExecution.status)
        ? account.lastExecution
        : null;
      return {
        // 상태가 키에 들어가 reader 가 상태 변화를 알릴 때만 다시 읽는다 — 이 읽기는 스스로 폴링하지 않는다.
        queryKey: [...registrationExecutionKeys.execution(execution?.id ?? ''), execution?.status ?? null] as const,
        queryFn: () => targetRegistrationExecutionApi.get(execution!.id),
        enabled: execution !== null,
      };
    }),
  });
  const refreshRegistrationState = () => {
    void queryClient.invalidateQueries({ queryKey: salesProductKeys.registrationState(product.id) });
  };
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
    mutationFn: async ({ target, draft }: { target?: RegistrationTarget; draft: TargetDraft }) => {
      const editable = editableInput(draft);
      if (!draft.channelAccountId) throw new Error('채널 계정을 먼저 고르세요.');
      // 설정이 생기는 길은 resolve 하나다(KID-313) — 없으면 만들고(그때 KID 를 받는다) 값을 고친다.
      const current = target ?? await registrationTargetApi.resolve({
        salesProductId: product.id,
        channelAccountId: draft.channelAccountId,
      });
      const input: RegistrationTargetUpdateInput = { ...editable, expectedVersion: current.version };
      return registrationTargetApi.update(current.id, input);
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
      const activeExecution = liveExecutionQueries[targetRows.indexOf(target)]?.data;
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
      refreshRegistrationState();
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
    onError: (error) => {
      refreshRegistrationState();
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
  const stateError = Boolean(registration.error);

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        몰 계정마다 등록 대상은 하나입니다. 가격은 판매상품 옵션 값 그대로 나가고, 선택하지 않은 옵션은 외부 송신에서 제외됩니다.
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="w-44 px-3 py-2 text-left font-semibold">쇼핑몰 계정</th>
              <th className="w-44 px-2 py-2 text-left font-semibold">등록 상태</th>
              <th className="px-2 py-2 text-left font-semibold">등록 이름</th>
              <th className="w-32 px-2 py-2 text-center font-semibold">선택 옵션</th>
              <th className="w-20 px-2 py-2 text-center font-semibold">버전</th>
              <th className="w-28 px-3 py-2" aria-label="저장" />
            </tr>
          </thead>
          <tbody>
            {targets.isLoading && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">등록 대상을 불러오는 중</td></tr>
            )}
            {!targets.isLoading && targetRows.length === 0 && !newDraft && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">등록 대상이 없습니다.</td></tr>
            )}
            {targetRows.map((target, targetIndex) => {
              const draft = drafts[target.id] ?? draftOf(product, target);
              const open = openTargetId === target.id;
              const account = rowAccounts[targetIndex];
              const liveQuery = liveExecutionQueries[targetIndex];
              const activeExecution = liveQuery?.data;
              // reader 가 아직 답하지 않았거나 살아 있는 실행을 아직 못 읽었으면 보내지 않는다 — 중복 송신을 막는다.
              const stateLoading = registration.isLoading || Boolean(liveQuery?.isLoading);
              const liveError = Boolean(liveQuery?.isError);
              const registered = account?.state === 'registered' && !activeExecution;
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
                    <td className="px-2 py-2">
                      <AccountRegistrationState account={account} />
                    </td>
                    <td className="px-2 py-2 text-slate-600">{product.name}</td>
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
                          disabled={execute.isPending || compositionExecution || registered || stateLoading || stateError || liveError || !accountById.get(target.channelAccountId) || !adapterAvailable}
                          onClick={() => {
                            const account = accountById.get(target.channelAccountId);
                            if (account && !compositionExecution) execute.mutate({ target, account });
                          }}
                          title={stateError || liveError
                            ? '등록 상태를 확인하지 못해 외부 송신을 잠시 막았습니다.'
                            : registered
                            ? '이미 몰에 등록됐습니다. 바뀐 값은 몰에 올라간 상품에서 다시 보냅니다.'
                            : compositionExecution
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
                            : registered ? '등록됨'
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
                  {(activeExecution || liveQuery?.isLoading || liveError || hasSameAccountListing) && (
                    <tr className="border-b border-slate-100 bg-slate-50/40">
                      <td colSpan={6} className="px-3 py-2.5">
                        <CompositionChangeLauncher
                          product={product}
                          target={target}
                          activeExecution={activeExecution}
                          historyLoading={stateLoading}
                          historyError={stateError || liveError}
                          onRecorded={refreshRegistrationState}
                        />
                        {activeExecution && (
                          <p className="text-[11px] text-amber-700">진행 중인 실행은 상태만 확인하며 재송신하지 않습니다.</p>
                        )}
                        {liveQuery?.isLoading ? (
                          <p className="mt-1 text-[11px] text-slate-400">진행 중인 실행을 불러오는 중…</p>
                        ) : liveError ? (
                          <p className="mt-1 text-[11px] text-red-600">진행 중인 실행을 확인하지 못해 외부 송신을 잠시 막았습니다.</p>
                        ) : activeExecution && canManuallyConfirmExecution(activeExecution) ? (
                          <TargetExecutionConfirmationForm
                            key={activeExecution.executionId}
                            execution={activeExecution}
                            onReported={refreshRegistrationState}
                          />
                        ) : null}
                      </td>
                    </tr>
                  )}
                  {open && (
                    <tr className="border-b border-slate-200 bg-slate-50/60">
                      <td colSpan={6} className="px-3 py-4">
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
                  <td className="px-2 py-2"><AccountRegistrationState account={undefined} /></td>
                  <td className="px-2 py-1.5 text-slate-500">{product.name}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-slate-600">{selectedCount(newDraft)} / {product.options.length}</td>
                  <td className="px-2 py-2 text-center text-xs text-slate-400">—</td>
                  <td className="px-3 py-1.5 text-right">
                    <button type="button" className="btn-secondary btn-sm" onClick={removeDraft}>취소</button>
                  </td>
                </tr>
                {openTargetId === 'new' && (
                  <tr className="border-b border-slate-200 bg-slate-50/60">
                    <td colSpan={6} className="px-3 py-4">
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
  const mallFieldsResult = useMemo(
    () => mallFieldsFromDraft(draft.mallFields, draft.storedMallFields),
    [draft.mallFields, draft.storedMallFields],
  );
  const documentError = mallFieldsResult.ok ? null : mallFieldsResult.error;
  const canSave = !documentError;
  const selected = new Set(draft.options.filter((option) => option.selected).map((option) => option.salesProductOptionId));
  const optionById = new Map(product.options.map((option) => [option.id, option]));

  return (
    <div className="space-y-4">
      <MallFieldsEditor
        value={draft.mallFields}
        error={documentError}
        onChange={(mallFields) => onChange({ ...draft, mallFields })}
      />
      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-semibold text-slate-600">외부 송신 옵션 · {selected.size}개 선택</p>
          <p className="text-[11px] text-slate-400">가격은 판매상품 옵션 값 그대로 나갑니다.</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="w-14 px-2 py-2 text-center font-semibold">선택</th>
                <th className="px-2 py-2 text-left font-semibold">옵션</th>
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
                        판매가 {formatWon(option.salePrice)} · 정상가 {option.normalPrice === null ? '—' : formatWon(option.normalPrice)}
                      </span>
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

/**
 * 몰 전용 칸 편집(KID-310 e) — 공급가 · 홍보문 · 재고 비율은 칸으로, 나머지 몰 키는 키 · 값 줄로 고친다.
 * 몰 카테고리는 위 표가, 어댑터 값은 등록 확인 대화상자가 고친다.
 */
function MallFieldsEditor({
  value,
  error,
  onChange,
}: {
  value: MallFieldsDraft;
  error: string | null;
  onChange: (next: MallFieldsDraft) => void;
}) {
  const setExtra = (index: number, patch: Partial<MallFieldsDraft['extra'][number]>) => onChange({
    ...value,
    extra: value.extra.map((row, at) => (at === index ? { ...row, ...patch } : row)),
  });
  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm';
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-slate-600">몰 전용 값</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">공급가</span>
          <input
            aria-label="몰 공급가"
            inputMode="numeric"
            value={value.supplyPrice}
            onChange={(event) => onChange({ ...value, supplyPrice: event.target.value })}
            className={`${inputClass} tabular-nums`}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">재고 비율(%)</span>
          <input
            aria-label="몰 재고 비율"
            inputMode="numeric"
            value={value.stockPercent}
            onChange={(event) => onChange({ ...value, stockPercent: event.target.value })}
            className={`${inputClass} tabular-nums`}
          />
        </label>
        <label className="block md:col-span-3">
          <span className="mb-1 block text-xs font-medium text-slate-500">홍보문</span>
          <textarea
            aria-label="몰 홍보문"
            value={value.promoText}
            onChange={(event) => onChange({ ...value, promoText: event.target.value })}
            rows={2}
            className={inputClass}
          />
        </label>
      </div>
      <div className="space-y-2">
        <p className="text-[11px] text-slate-500">그 밖의 몰 칸(배송 템플릿 · 반품지 · 몰 브랜드 코드 …)</p>
        {value.extra.map((row, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-start gap-2">
            <input
              aria-label={`몰 칸 ${index + 1} 이름`}
              value={row.key}
              onChange={(event) => setExtra(index, { key: event.target.value })}
              placeholder="칸 이름"
              className={`${inputClass} font-mono text-xs`}
            />
            <input
              aria-label={`몰 칸 ${index + 1} 값`}
              value={row.value}
              onChange={(event) => setExtra(index, { value: event.target.value })}
              placeholder="값"
              className={inputClass}
            />
            <button
              type="button"
              aria-label={`몰 칸 ${index + 1} 지우기`}
              onClick={() => onChange({ ...value, extra: value.extra.filter((_, at) => at !== index) })}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50"
            >
              <Trash2 size={14} aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...value, extra: [...value.extra, { key: '', value: '' }] })}
          className="btn-secondary btn-sm inline-flex items-center gap-1"
        >
          <Plus size={13} aria-hidden />
          몰 칸 더하기
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
