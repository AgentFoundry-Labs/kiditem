'use client';

import { useCallback, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertCircle, Info, Loader2, PackagePlus, RefreshCw, Search } from 'lucide-react';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { Pagination } from '@/components/ui/Pagination';
import { mallPublishingApi } from '../_shared/mall-publishing-api';
import { MallTargetGrid } from './components/MallTargetGrid';
import { PreflightTable } from './components/PreflightTable';

const PAGE_SIZE = 25;

/**
 * 몰별 상품등록.
 *
 * 지금은 "이 상품을 어느 몰에 올릴 수 있는가" 까지만 답한다. 몰에 실제로
 * 보내는 경로는 아직 없다 — 검증을 먼저 세우고 송신을 여는 순서다.
 */
export default function MallListingsPage() {
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set());
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const targetsQuery = useQuery({
    queryKey: queryKeys.mallPublishing.targets(),
    queryFn: mallPublishingApi.targets,
  });
  const targets = useMemo(() => targetsQuery.data ?? [], [targetsQuery.data]);

  const mallKeys = useMemo(() => [...selectedKeys].sort(), [selectedKeys]);
  const preflightQuery = useQuery({
    queryKey: queryKeys.mallPublishing.preflight({
      mallKeys: mallKeys.join(',') || 'default',
      search,
      page: String(page),
    }),
    queryFn: () =>
      mallPublishingApi.preflight({
        ...(mallKeys.length > 0 ? { mallKeys } : {}),
        ...(search ? { search } : {}),
        page,
        limit: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const handleToggle = useCallback((mallKey: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(mallKey)) next.delete(mallKey);
      else next.add(mallKey);
      return next;
    });
    setPage(1);
  }, []);

  const summary = useMemo(() => {
    const sendable = targets.filter((target) => target.readiness === 'ready');
    const blocked = targets.filter(
      (target) => target.readiness !== 'ready' && target.readiness !== 'unsupported',
    );
    const unsupported = targets.filter((target) => target.readiness === 'unsupported');
    return { total: targets.length, sendable: sendable.length, blocked: blocked.length, unsupported: unsupported.length };
  }, [targets]);

  const preflight = preflightQuery.data;
  const readyProducts = preflight?.products.filter((product) => product.eligibleMallCount > 0).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <PackagePlus className="h-6 w-6 text-slate-600" />
            상품 등록
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            상품을 여러 몰에 한 번에 올립니다. 지금은 송신 전 검증까지 동작합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void targetsQuery.refetch();
            void preflightQuery.refetch();
          }}
          disabled={targetsQuery.isFetching || preflightQuery.isFetching}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={15}
            className={targetsQuery.isFetching || preflightQuery.isFetching ? 'animate-spin' : ''}
          />
          새로고침
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="송신 준비된 몰" value={summary.sendable} tone="emerald" />
        <SummaryCard label="설정 필요" value={summary.blocked} tone="amber" />
        <SummaryCard label="경로 미확인" value={summary.unsupported} tone="slate" />
        <SummaryCard label="올릴 수 있는 상품" value={readyProducts} />
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">
            대상 몰
            {selectedKeys.size > 0 ? (
              <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-[11px] font-semibold text-purple-700">
                {selectedKeys.size}개 선택
              </span>
            ) : null}
          </h2>
          <p className="text-xs text-slate-400">
            선택하지 않으면 송신 경로가 확인된 몰 전체로 검증합니다.
          </p>
        </div>
        {targetsQuery.isError ? (
          <ErrorBox error={targetsQuery.error} fallback="몰 목록을 불러오지 못했습니다." />
        ) : targetsQuery.isLoading ? (
          <LoadingBox />
        ) : (
          <MallTargetGrid targets={targets} selectedKeys={selectedKeys} onToggle={handleToggle} />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">
            송신 전 검증
            {preflight ? (
              <span className="ml-2 text-xs font-normal text-slate-400">
                {formatNumber(preflight.total)}개 상품 · {preflight.mallKeys.length}개 몰 기준
              </span>
            ) : null}
          </h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchInput.trim());
              setPage(1);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="상품명 또는 코드"
                aria-label="상품 검색"
                className="w-56 rounded-md border border-slate-200 py-2 pl-8 pr-2 text-sm outline-none focus:border-purple-400"
              />
            </div>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              검색
            </button>
          </form>
        </div>

        {preflightQuery.isError ? (
          <ErrorBox error={preflightQuery.error} fallback="검증 결과를 불러오지 못했습니다." />
        ) : preflightQuery.isLoading ? (
          <LoadingBox />
        ) : preflight ? (
          <div className="space-y-0">
            <PreflightTable products={preflight.products} mallCount={preflight.mallKeys.length} />
            <div className="rounded-b-xl border border-t-0 border-slate-200 bg-white">
              <Pagination
                page={page}
                limit={PAGE_SIZE}
                total={preflight.total}
                onPageChange={setPage}
              />
            </div>
          </div>
        ) : null}
      </section>

      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <Info size={15} className="mt-0.5 flex-none" />
        <div>
          <strong>이 화면은 아직 몰에 아무것도 보내지 않습니다.</strong> 상품정보고시·KC 인증·
          몰 카테고리는 아직 입력 화면이 없어 대부분의 상품이 막힌 것으로 나옵니다. 그게 지금의
          실제 상태이고, 무엇을 먼저 채워야 하는지가 위 표의 &lsquo;막고 있는 것&rsquo; 열입니다.
          송신·결과 확인은 다음 단계에서 <strong>송신 내역</strong> 화면과 함께 열립니다.
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'emerald' | 'amber' | 'slate';
}) {
  const toneClass = {
    default: 'text-slate-900',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    slate: 'text-slate-400',
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${toneClass}`}>{formatNumber(value)}</div>
    </div>
  );
}

function LoadingBox() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
      <Loader2 size={15} className="animate-spin" />
      불러오는 중
    </div>
  );
}

function ErrorBox({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-5 text-sm text-red-600">
      <AlertCircle size={15} />
      {isApiError(error) ? error.detail : fallback}
    </div>
  );
}
