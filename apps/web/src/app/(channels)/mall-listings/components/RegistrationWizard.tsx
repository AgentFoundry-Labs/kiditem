'use client';

import { useCallback, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, ArrowRight, RotateCcw, Send } from 'lucide-react';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber } from '@/lib/utils';
import { salesProductApi, salesProductKeys } from '@/lib/sales-product-api';
import { mallPublishingApi } from '../../_shared/mall-publishing-api';
import { MALL_REGISTRATION_ADAPTERS, getMallPublishAdapter } from '../../_shared/adapters';
import {
  defaultAdapterValues,
  missingRequiredFields,
  type MallPublishAdapter,
  type MallPublishItem,
} from '../../_shared/mall-publish-adapter';
import { buildPublishPlan, summarizePublishRun } from '../lib/publish-plan';
import {
  detectMallFormSubmitMalls,
} from '../../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import { useMallPublishRun } from '../../_shared/use-mall-publish-run';
import { StepProducts } from './StepProducts';
import { StepMalls } from './StepMalls';
import { StepValues } from './StepValues';
import { StepDispatch } from './StepDispatch';
const PAGE_SIZE = 25;

type ProductSource = 'sales_product' | 'candidate';

const STEPS = [
  { id: 1, label: '상품' },
  { id: 2, label: '몰' },
  { id: 3, label: '값 확인' },
  { id: 4, label: '송신' },
] as const;

function initialValues(): Record<string, Record<string, string>> {
  const values: Record<string, Record<string, string>> = {};
  for (const adapter of MALL_REGISTRATION_ADAPTERS) {
    values[adapter.mallKey] = defaultAdapterValues(adapter);
  }
  return values;
}

/**
 * 새 등록 — 상품 N개 × 몰 M개.
 *
 * 이 화면은 몰을 하나도 모른다. 어떤 몰이 있고, 그 몰이 무슨 값을 원하고, 어떻게
 * 보내는지는 전부 어댑터(`_shared/adapters/`)가 안다. 몰이 늘어도 이 파일은
 * 그대로다 — 몰마다 버튼과 상태를 새로 만들던 방식을 여기서 끝낸다.
 *
 * 4단계인 이유는 각 단계가 서로 다른 질문이기 때문이다.
 *  1 무엇을 (상품)  2 어디에 (몰)  3 어떤 값으로 (몰별)  4 실제로 보내기
 * 3단계가 이 화면의 핵심이다. 같은 상품이 몰마다 다른 값으로 들어가고, 그 차이를
 * 보지 못한 채 보내는 것이 지금까지의 문제였다.
 *
 * 등록 **현황**은 다른 질문이라 다른 탭이 답한다(`ListingMatrixTable`). 여기는
 * 수집상품에서 시작하고, 현황은 상품 마스터에서 시작한다 — 리스팅이 마스터에
 * 걸려 있기 때문이다.
 */
export function RegistrationWizard() {
  const [step, setStep] = useState(1);
  const [page, setPage] = useState(1);
  const [selectedItems, setSelectedItems] = useState<Map<string, MallPublishItem>>(new Map());
  const [selectedMalls, setSelectedMalls] = useState<ReadonlySet<string>>(new Set());
  const [valuesByMall, setValuesByMall] = useState(initialValues);
  const [editedValuesByMall, setEditedValuesByMall] = useState<Record<string, Record<string, string>>>({});
  const [activeMallKey, setActiveMallKey] = useState('');

  const run = useMallPublishRun();

  // 판매상품(ADR-0014)이 기본이다 — 한 번 편집한 상품을 몰로 보낸다. 수집상품에서 바로 보내는 길은 남겨 둔다.
  const [source, setSource] = useState<ProductSource>('sales_product');
  const [search, setSearch] = useState('');

  // 수집상품은 KID 를 아직 받지 않은 판매상품 초안이다(KID-313) — 원본 기록 목록은 화면에 없다.
  const productsQuery = useQuery({
    queryKey: salesProductKeys.list({ page, limit: PAGE_SIZE, focus: 'preparing' }),
    queryFn: () => salesProductApi.list({ page, limit: PAGE_SIZE, focus: 'preparing' }),
    placeholderData: keepPreviousData,
    enabled: source === 'candidate',
  });

  const salesQuery = useQuery({
    queryKey: salesProductKeys.list({ page, limit: PAGE_SIZE, query: search || undefined, focus: 'all' }),
    queryFn: () => salesProductApi.list({ page, limit: PAGE_SIZE, query: search || undefined, focus: 'all' }),
    placeholderData: keepPreviousData,
    enabled: source === 'sales_product',
  });

  const targetsQuery = useQuery({
    queryKey: queryKeys.mallPublishing.targets(),
    queryFn: mallPublishingApi.targets,
  });

  // 확장이 [등록]까지 누르는 몰(ADR-0015) — 확장 핑이 알려 주는 폼 스펙 이름을 몰 계정 키로 바꾼다.
  const submitMallsQuery = useQuery({
    queryKey: ['mall-listings', 'form-submit-malls'],
    queryFn: detectMallFormSubmitMalls,
    staleTime: 60_000,
  });
  const autoSubmitMalls = useMemo(() => new Set(
    (Array.isArray(submitMallsQuery.data) ? submitMallsQuery.data : [])
      .filter((mall): mall is string => typeof mall === 'string'),
  ), [submitMallsQuery.data]);

  const pageItems = useMemo<MallPublishItem[]>(
    () => source === 'sales_product'
      ? (salesQuery.data?.items ?? []).map((product) => ({
        candidateId: product.id,
        name: product.name,
        salePrice: product.salePrice,
        thumbnailUrl: product.imageUrl,
        source: 'sales_product' as const,
        optionCount: product.optionAxes.length > 0 ? product.optionCount : 1,
      }))
      : (productsQuery.data?.items ?? []).map((product) => ({
        candidateId: product.id,
        name: product.name,
        salePrice: product.salePrice,
        thumbnailUrl: product.imageUrl,
        source: 'candidate' as const,
        // 수집상품 한 줄이 곧 판매상품 초안이다(ADR-0022) — 등록은 이 id 를 그대로 연다.
        salesProductId: product.id,
      })),
    [source, productsQuery.data, salesQuery.data],
  );

  const changeSource = useCallback((next: ProductSource) => {
    setSource(next);
    setPage(1);
    setSelectedItems(new Map());
  }, []);

  const items = useMemo(() => [...selectedItems.values()], [selectedItems]);

  const adapters = useMemo<MallPublishAdapter[]>(
    () =>
      [...selectedMalls]
        .map((mallKey) => getMallPublishAdapter(mallKey))
        .filter((adapter): adapter is MallPublishAdapter => adapter !== null),
    [selectedMalls],
  );

  const plan = useMemo(
    () => buildPublishPlan({
      items,
      adapters,
      valuesByMall,
      editedValuesByMall,
      channelAccountIds: Object.fromEntries((targetsQuery.data ?? []).map((target) => [
        target.manifest.key,
        target.channelAccountId,
      ])),
    }),
    [
      items,
      adapters,
      valuesByMall,
      editedValuesByMall,
      targetsQuery.data,
    ],
  );

  const missingByMall = useMemo(
    () => adapters.filter((adapter) => missingRequiredFields(adapter, valuesByMall[adapter.mallKey] ?? {}).length > 0),
    [adapters, valuesByMall],
  );
  const hasFormAdapter = adapters.some((adapter) => adapter.mode === 'form');

  const toggleProduct = useCallback((candidateId: string) => {
    setSelectedItems((current) => {
      const next = new Map(current);
      if (next.has(candidateId)) {
        next.delete(candidateId);
        return next;
      }
      const found = pageItems.find((item) => item.candidateId === candidateId);
      if (found) next.set(candidateId, found);
      return next;
    });
  }, [pageItems]);

  const toggleAllOnPage = useCallback(() => {
    setSelectedItems((current) => {
      const next = new Map(current);
      const allSelected = pageItems.length > 0 && pageItems.every((item) => next.has(item.candidateId));
      for (const item of pageItems) {
        if (allSelected) next.delete(item.candidateId);
        else next.set(item.candidateId, item);
      }
      return next;
    });
  }, [pageItems]);

  const toggleMall = useCallback((mallKey: string) => {
    setSelectedMalls((current) => {
      const next = new Set(current);
      if (next.has(mallKey)) next.delete(mallKey);
      else next.add(mallKey);
      return next;
    });
    setActiveMallKey((current) => (current === mallKey ? '' : current || mallKey));
  }, []);

  const changeValue = useCallback((mallKey: string, fieldKey: string, value: string) => {
    setValuesByMall((current) => ({
      ...current,
      [mallKey]: { ...(current[mallKey] ?? {}), [fieldKey]: value },
    }));
    setEditedValuesByMall((current) => ({
      ...current,
      [mallKey]: { ...(current[mallKey] ?? {}), [fieldKey]: value },
    }));
  }, []);

  const restart = useCallback(() => {
    run.reset();
    setStep(1);
  }, [run]);

  const summary = summarizePublishRun(run.tasks);
  const canAdvance =
    step === 1 ? items.length > 0
      : step === 2 ? adapters.length > 0
        : step === 3 ? plan.sendCount > 0
          && missingByMall.length === 0
          && (!hasFormAdapter || targetsQuery.isSuccess)
          : false;

  return (
    <div className="space-y-6 pb-24">
      <StepRail current={step} onSelect={setStep} maxReached={run.tasks.length > 0 ? 4 : step} />

      {targetsQuery.isError ? (
        <ErrorBox error={targetsQuery.error} fallback="몰 목록을 불러오지 못했습니다." />
      ) : null}
      {source === 'candidate' && productsQuery.isError ? (
        <ErrorBox error={productsQuery.error} fallback="수집 상품을 불러오지 못했습니다." />
      ) : null}
      {source === 'sales_product' && salesQuery.isError ? (
        <ErrorBox error={salesQuery.error} fallback="판매상품을 불러오지 못했습니다." />
      ) : null}
      {step === 1 ? (
        <StepProducts
          source={source}
          onSourceChange={changeSource}
          search={search}
          onSearch={(next) => {
            setSearch(next);
            setPage(1);
          }}
          items={pageItems}
          total={(source === 'sales_product' ? salesQuery.data?.total : productsQuery.data?.total) ?? 0}
          page={page}
          limit={PAGE_SIZE}
          loading={source === 'sales_product' ? salesQuery.isLoading : productsQuery.isLoading}
          selected={new Set(selectedItems.keys())}
          onPageChange={setPage}
          onToggle={toggleProduct}
          onToggleAll={toggleAllOnPage}
        />
      ) : null}

      {step === 2 ? (
        <StepMalls
          targets={targetsQuery.data ?? []}
          selected={selectedMalls}
          productCount={items.length}
          onToggle={toggleMall}
          autoSubmitMalls={autoSubmitMalls}
        />
      ) : null}

      {step === 3 ? (
        <StepValues
          adapters={adapters}
          items={items}
          activeMallKey={activeMallKey || adapters[0]?.mallKey || ''}
          valuesByMall={valuesByMall}
          blocks={plan.blocks}
          onSelectMall={setActiveMallKey}
          onChangeValue={changeValue}
        />
      ) : null}

      {step === 4 ? <StepDispatch tasks={run.tasks} running={run.running} /> : null}

      <ActionBar
        step={step}
        productCount={items.length}
        mallCount={adapters.length}
        sendCount={plan.sendCount}
        blockedCount={plan.blocks.length}
        taskCount={plan.tasks.length}
        canAdvance={canAdvance}
        running={run.running}
        finished={summary.done}
        onBack={() => setStep((current) => Math.max(1, current - 1))}
        onNext={() => setStep((current) => Math.min(4, current + 1))}
        onSend={() => {
          setStep(4);
          void run.start(plan.tasks);
        }}
        onCancel={run.cancel}
        onRestart={restart}
      />
    </div>
  );
}

function StepRail({
  current,
  maxReached,
  onSelect,
}: {
  current: number;
  maxReached: number;
  onSelect: (step: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {STEPS.map((entry, index) => {
        const reachable = entry.id <= Math.max(current, maxReached);
        return (
          <li key={entry.id} className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onSelect(entry.id)}
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                entry.id === current
                  ? 'border-purple-300 bg-purple-50 text-purple-900'
                  : reachable
                    ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300',
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full text-[10px]',
                  entry.id === current ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600',
                )}
              >
                {entry.id}
              </span>
              {entry.label}
            </button>
            {index < STEPS.length - 1 ? <span className="text-slate-300">›</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * 아래 고정 막대.
 *
 * `상품 N × 몰 M = K건` 을 항상 보여준다. 이 곱셈이 화면의 전부고, 사람이 무엇을
 * 누르려는지 매 순간 알아야 하는 값이다.
 */
function ActionBar({
  step,
  productCount,
  mallCount,
  sendCount,
  blockedCount,
  taskCount,
  canAdvance,
  running,
  finished,
  onBack,
  onNext,
  onSend,
  onCancel,
  onRestart,
}: {
  step: number;
  productCount: number;
  mallCount: number;
  sendCount: number;
  blockedCount: number;
  taskCount: number;
  canAdvance: boolean;
  running: boolean;
  finished: boolean;
  onBack: () => void;
  onNext: () => void;
  onSend: () => void;
  onCancel: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          <span className="font-semibold text-slate-900">상품 {formatNumber(productCount)}</span>
          <span className="text-slate-400">×</span>
          <span className="font-semibold text-slate-900">몰 {formatNumber(mallCount)}</span>
          <span className="text-slate-400">=</span>
          <span className="font-semibold text-purple-700">{formatNumber(sendCount)}건</span>
          {taskCount > 0 ? (
            <span className="text-xs text-slate-400">· 작업 {formatNumber(taskCount)}개</span>
          ) : null}
          {blockedCount > 0 ? (
            <span className="text-xs text-amber-600">· 막힘 {formatNumber(blockedCount)}건</span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {step > 1 && !running ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft size={14} />
              이전
            </button>
          ) : null}

          {step < 3 ? (
            <button
              type="button"
              disabled={!canAdvance}
              onClick={onNext}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              다음
              <ArrowRight size={14} />
            </button>
          ) : null}

          {step === 3 ? (
            <button
              type="button"
              disabled={!canAdvance}
              onClick={onSend}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={14} />
              {formatNumber(sendCount)}건 보내기
            </button>
          ) : null}

          {step === 4 && running ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              남은 작업 중단
            </button>
          ) : null}

          {step === 4 && finished ? (
            <button
              type="button"
              onClick={onRestart}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw size={14} />
              처음부터
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-4 text-sm text-red-600">
      <AlertCircle size={15} />
      {isApiError(error) ? error.detail : fallback}
    </div>
  );
}
