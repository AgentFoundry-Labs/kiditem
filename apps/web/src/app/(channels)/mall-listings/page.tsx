'use client';

import { useCallback, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertCircle, Info, PackagePlus, RefreshCw, Search } from 'lucide-react';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber } from '@/lib/utils';
import { Pagination } from '@/components/ui/Pagination';
import type { MallMatrixFilter } from '@kiditem/shared/mall-publishing';
import { mallPublishingApi } from '../_shared/mall-publishing-api';
import { SabangnetListingsImport } from '../_shared/SabangnetListingsImport';
import { MALL_ADMIN_LISTING_MALL_KEYS } from '@kiditem/shared/mall-admin-listings';
import { MallAdminListingsImport } from '../_shared/MallAdminListingsImport';
import { MallAvailabilitySend } from '../_shared/MallAvailabilitySend';
import { MALL_PUBLISH_ADAPTERS } from '../_shared/adapters';
import { ListingMatrixTable } from './components/ListingMatrixTable';
import { RegistrationWizard } from './components/RegistrationWizard';

const PAGE_SIZE = 25;

/**
 * 기본은 등록된 상품이다.
 *
 * 활성 마스터 2,951건 중 리스팅이 있는 것은 408건뿐이라(라이브 실측 2026-09-09),
 * 전체를 기본으로 두면 첫 페이지가 거의 전부 빈 행이 된다. 표가 아무것도
 * 말하지 않는 상태로 열리는 것보다 좁혀서 여는 편이 낫다.
 */
const FILTERS: { id: MallMatrixFilter; label: string }[] = [
  { id: 'listed', label: '등록됨' },
  { id: 'unlisted', label: '미등록' },
  { id: 'all', label: '전체' },
];

type View = 'status' | 'register';

const VIEWS: { id: View; label: string }[] = [
  { id: 'status', label: '등록 현황' },
  { id: 'register', label: '새 등록' },
];

/**
 * 상품 등록.
 *
 * 두 개의 다른 질문을 두 탭이 나눠 답한다.
 *  - 등록 현황: 지금 어느 상품이 어느 몰에 올라가 있는가 (상품 마스터 기준)
 *  - 새 등록:   무엇을 어느 몰로 새로 보낼 것인가 (수집상품 기준)
 *
 * 기준 엔티티가 다른 것은 실수가 아니다. 리스팅은 상품 마스터에 걸려 있고
 * (라이브 실측 2026-09-09: 마스터 연결 871건 · 수집상품 연결 2건), 등록은
 * 수집상품에서 출발한다. 한 엔티티로 억지로 합치면 둘 중 하나가 빈 표가 된다.
 */
export default function MallListingsPage() {
  const [view, setView] = useState<View>('status');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <PackagePlus className="h-6 w-6 text-slate-600" />
            상품 등록
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            어느 상품이 어느 몰에 올라가 있는지 보고, 여러 몰에 한 번에 보냅니다.
          </p>
        </div>
        <nav className="flex gap-2" aria-label="화면 전환">
          {VIEWS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setView(entry.id)}
              className={cn('tab', view === entry.id ? 'tab-active' : 'tab-inactive')}
            >
              {entry.label}
            </button>
          ))}
        </nav>
      </div>

      {view === 'status' ? <ListingStatusView /> : <RegistrationWizard />}
    </div>
  );
}

/**
 * 등록 현황.
 *
 * 열은 우리가 리스팅을 가져온 몰이고, 거기에 어댑터가 있는 몰을 더한다.
 * 어댑터가 있다는 것은 "보낼 수 있다"이지 "그 몰을 안다"가 아니라서, 가져오지
 * 않은 열은 표가 따로 표시한다.
 */
function ListingStatusView() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MallMatrixFilter>('listed');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const adapterMallKeys = useMemo(
    () => MALL_PUBLISH_ADAPTERS.map((adapter) => adapter.mallKey),
    [],
  );

  const matrixQuery = useQuery({
    queryKey: queryKeys.mallPublishing.listingMatrix({
      page: String(page),
      search,
      filter,
      mallKeys: adapterMallKeys.join(','),
    }),
    queryFn: () =>
      mallPublishingApi.listingMatrix({
        mallKeys: adapterMallKeys,
        filter,
        ...(search ? { search } : {}),
        page,
        limit: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const matrix = matrixQuery.data;
  const rows = useMemo(() => matrix?.rows ?? [], [matrix]);
  const columns = useMemo(() => matrix?.columns ?? [], [matrix]);

  const summary = useMemo(() => {
    const onAtLeastOne = rows.filter((row) => row.publishedCount > 0).length;
    const attention = rows.reduce(
      (count, row) =>
        count + row.cells.filter((cell) => cell.state === 'error' || cell.state === 'unknown').length,
      0,
    );
    const importedColumns = columns.filter((column) => column.imported).length;
    return { onAtLeastOne, attention, importedColumns };
  }, [rows, columns]);

  const toggle = useCallback((masterProductId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(masterProductId)) next.delete(masterProductId);
      else next.add(masterProductId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((current) => {
      const next = new Set(current);
      const allSelected = rows.length > 0 && rows.every((row) => next.has(row.masterProductId));
      for (const row of rows) {
        if (allSelected) next.delete(row.masterProductId);
        else next.add(row.masterProductId);
      }
      return next;
    });
  }, [rows]);

  const notImported = columns.filter((column) => !column.imported);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="상품" value={matrix?.total ?? 0} />
        <SummaryCard label="한 곳 이상 발행" value={summary.onAtLeastOne} tone="text-green-600" />
        <SummaryCard label="확인 필요" value={summary.attention} tone="text-orange-600" />
        <SummaryCard label="현황을 아는 몰" value={summary.importedColumns} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex gap-1" role="group" aria-label="표시할 상품">
            {FILTERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  setFilter(entry.id);
                  setPage(1);
                }}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  filter === entry.id
                    ? 'bg-primary text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
          {selected.size > 0 ? (
            <span className="text-xs text-slate-400">{formatNumber(selected.size)}개 선택됨</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
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
          <button
            type="button"
            onClick={() => void matrixQuery.refetch()}
            disabled={matrixQuery.isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={matrixQuery.isFetching ? 'animate-spin' : ''} />
            새로고침
          </button>
        </div>
      </div>

      {/* 품절은 등록의 반대가 아니라 같은 표의 다음 동작이다 — 어느 상품이 어느 몰에
          올라가 있는지 보는 자리에서 그중 재고가 빈 것을 바로 내린다(사장님 2026-09-18). */}
      <MallAvailabilitySend />

      {matrixQuery.isError ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-4 text-sm text-red-600">
          <AlertCircle size={15} />
          {isApiError(matrixQuery.error) ? matrixQuery.error.message : '등록 현황을 불러오지 못했습니다.'}
        </div>
      ) : (
        <>
          <ListingMatrixTable
            columns={columns}
            rows={rows}
            selected={selected}
            loading={matrixQuery.isLoading}
            onToggle={toggle}
            onToggleAll={toggleAll}
          />
          <div className="table-card">
            <Pagination
              page={page}
              limit={PAGE_SIZE}
              total={matrix?.total ?? 0}
              onPageChange={setPage}
            />
          </div>
        </>
      )}

      {notImported.length > 0 ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Info size={15} className="mt-0.5 flex-none" />
          <div>
            <strong>
              {notImported.map((column) => column.mallName).join(', ')} 은(는) 리스팅을 아직 가져오지
              않았습니다.
            </strong>
            <p className="mt-1 text-xs leading-relaxed">
              그 열의 &lsquo;미등록&rsquo;은 몰에 상품이 없다는 뜻이 아니라 우리가 모른다는 뜻입니다.
              사방넷으로 올린 몰은 사방넷 송신 기록에서 한꺼번에 가져오고, 사방넷에 없는 키드키즈 ·
              아이스크림몰은 그 몰 관리자에서 직접 가져옵니다.
            </p>
            <SabangnetListingsImport className="mt-2 justify-start" />
            {MALL_ADMIN_LISTING_MALL_KEYS.map((mallKey) => (
              <MallAdminListingsImport key={mallKey} mallKey={mallKey} className="mt-2 justify-start" />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'text-slate-900',
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className={cn('card-value', tone)}>{formatNumber(value)}</div>
    </div>
  );
}
