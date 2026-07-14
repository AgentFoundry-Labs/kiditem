'use client';

import { Fragment, useMemo, useState } from 'react';
import { Check, Link2, Loader2, PackageSearch, RotateCcw, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatNumber } from '@/lib/utils';
import { usePatchWingListing, useSyncWing, useWingCatalog } from './hooks/useWingCatalog';
import { RocketStatusView } from './components/RocketStatusView';
import {
  defaultSearchKeyword,
  searchInventoryOptions,
  type CoupangListing,
  type InventoryOption,
  type MatchStatus,
} from './lib/rocket-register-db-api';

type Filter = 'review' | 'linked' | 'unmatched' | 'all';
type Mode = 'rocket' | 'wing';

const MODE_TABS: { key: Mode; label: string }[] = [
  { key: 'rocket', label: '로켓 등록 현황' },
  { key: 'wing', label: 'WING 매칭' },
];

const REVIEW_STATUSES: MatchStatus[] = ['suggested', 'fuzzy', 'unmatched'];

const STATUS_BADGE: Record<MatchStatus, { label: string; cls: string }> = {
  suggested: { label: '매칭됨 · 검토', cls: 'bg-[var(--primary-soft)] text-[var(--primary)]' },
  fuzzy: { label: '유사매칭 · 확인', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  unmatched: { label: '미매칭', cls: 'bg-[var(--surface-sunken)] text-[var(--text-muted)]' },
  linked: { label: '승인됨', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  bundled: { label: '번들연결', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  ignored: { label: '무시', cls: 'bg-red-500/15 text-red-600 dark:text-red-400' },
};

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: 'review', label: '검토' },
  { key: 'linked', label: '승인됨' },
  { key: 'unmatched', label: '미매칭' },
  { key: 'all', label: '전체' },
];

export default function RocketRegisterPage() {
  const [mode, setMode] = useState<Mode>('rocket');
  const [maxPages, setMaxPages] = useState(5);
  const [filter, setFilter] = useState<Filter>('review');
  const [searchOpenId, setSearchOpenId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<InventoryOption[]>([]);
  const [searching, setSearching] = useState(false);

  const catalog = useWingCatalog();
  const syncWing = useSyncWing();
  const patch = usePatchWingListing();

  const rows = useMemo(() => catalog.data ?? [], [catalog.data]);

  const summary = useMemo(() => {
    let review = 0;
    let linked = 0;
    let unmatched = 0;
    for (const r of rows) {
      if (r.matchStatus === 'linked' || r.matchStatus === 'bundled') linked += 1;
      else if (r.matchStatus === 'unmatched') unmatched += 1;
      if (REVIEW_STATUSES.includes(r.matchStatus)) review += 1;
    }
    return { total: rows.length, review, linked, unmatched };
  }, [rows]);

  const visible = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'linked') return rows.filter((r) => r.matchStatus === 'linked' || r.matchStatus === 'bundled');
    if (filter === 'unmatched') return rows.filter((r) => r.matchStatus === 'unmatched');
    return rows.filter((r) => REVIEW_STATUSES.includes(r.matchStatus));
  }, [rows, filter]);

  const handleSync = () => {
    syncWing.mutate(
      { maxPages },
      {
        onSuccess: (res) =>
          toast.success(
            `WING ${formatNumber(res.total)}개 저장 · 매칭 ${formatNumber(res.matched)}(검토 ${formatNumber(res.suggested)}/유사 ${formatNumber(res.fuzzy)}) · 미매칭 ${formatNumber(res.unmatched)}`,
          ),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'WING 재고매칭 실패'),
      },
    );
  };

  const setStatus = (r: CoupangListing, matchStatus: MatchStatus) =>
    patch.mutate(
      { id: r.id, matchStatus },
      { onError: (e) => toast.error(e instanceof Error ? e.message : '변경 실패') },
    );

  const openSearch = (r: CoupangListing) => {
    if (searchOpenId === r.id) {
      setSearchOpenId(null);
      return;
    }
    setSearchOpenId(r.id);
    setKeyword(defaultSearchKeyword(r.productName));
    setResults([]);
  };

  const runSearch = async () => {
    const kw = keyword.trim();
    if (!kw) return;
    setSearching(true);
    try {
      setResults(await searchInventoryOptions(kw));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '재고 검색 실패');
    } finally {
      setSearching(false);
    }
  };

  const linkTo = (r: CoupangListing, optionId: string) =>
    patch.mutate(
      { id: r.id, matchedOptionId: optionId, matchStatus: 'linked' },
      {
        onSuccess: () => {
          setSearchOpenId(null);
          toast.success('재고에 연결했습니다.');
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : '연결 실패'),
      },
    );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-[var(--text-strong)]">쿠팡 로켓 등록</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          WING 상품을 불러와 <b>셀피아 재고와 이름매칭</b>해서 DB에 저장합니다. 매칭된 재고에 로켓 옵션ID가 연결되고,
          검토 후 <b>승인</b>하면 확정됩니다. (매칭은 최신 셀피아 동기화 재고 기준)
        </p>
      </header>

      {/* 모드 전환: 로켓 등록 현황 ↔ WING 매칭 */}
      <div className="mb-4 flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-1">
        {MODE_TABS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              mode === m.key
                ? 'bg-[var(--surface)] text-[var(--text-strong)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-strong)]',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'rocket' && <RocketStatusView />}

      {mode === 'wing' && (
      <>
      {/* 컨트롤 */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          페이지 수
          <input
            type="number"
            min={1}
            max={60}
            value={maxPages}
            onChange={(e) => setMaxPages(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
            className="w-16 rounded border border-[var(--border)] bg-[var(--surface-sunken)] px-2 py-1 text-center text-[var(--text-strong)]"
          />
          <span className="text-xs">×50개</span>
        </label>

        <button
          type="button"
          onClick={handleSync}
          disabled={syncWing.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {syncWing.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageSearch className="h-4 w-4" />}
          WING 불러오기 + 재고매칭 저장
        </button>

        {catalog.isFetching && !syncWing.isPending && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> 불러오는 중
          </span>
        )}
      </div>

      {/* 요약 */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="전체" value={summary.total} />
        <SummaryCard label="검토 대기" value={summary.review} tone="primary" />
        <SummaryCard label="승인됨" value={summary.linked} tone="emerald" />
        <SummaryCard label="미매칭" value={summary.unmatched} tone="muted" />
      </div>

      {/* 필터 */}
      <div className="mb-3 flex gap-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium',
              filter === tab.key
                ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      {catalog.isLoading ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--text-muted)]">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--text-muted)]">
          {rows.length === 0
            ? '위의 WING 불러오기 + 재고매칭 저장 을 실행하세요.'
            : '이 상태의 상품이 없습니다.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-3 py-2 font-medium">WING 상품명</th>
                <th className="px-3 py-2 font-medium">옵션ID</th>
                <th className="px-3 py-2 font-medium">매칭된 재고</th>
                <th className="px-3 py-2 text-right font-medium">쿠팡가</th>
                <th className="px-3 py-2 text-right font-medium">공급가</th>
                <th className="px-3 py-2 text-right font-medium">마진</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2 font-medium">검토</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const badge = STATUS_BADGE[r.matchStatus];
                const isReview = r.matchStatus === 'suggested' || r.matchStatus === 'fuzzy';
                const isDone = r.matchStatus === 'linked' || r.matchStatus === 'bundled';
                const cost = r.matchedOption?.costPrice ?? null;
                const margin = r.salePrice != null && cost != null ? r.salePrice - cost : null;
                const marginPct =
                  margin != null && r.salePrice ? Math.round((margin / r.salePrice) * 100) : null;
                return (
                  <Fragment key={r.id}>
                    <tr className="border-b border-[var(--border)] last:border-0">
                    <td className="max-w-[240px] px-3 py-2">
                      <div className="truncate text-[var(--text-strong)]" title={r.productName}>
                        {r.productName}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-[var(--text-muted)]">{r.vendorItemId ?? '-'}</td>
                    <td className="max-w-[240px] px-3 py-2">
                      {r.matchedOption ? (
                        <div className="truncate text-[var(--text-strong)]" title={r.matchedOption.name}>
                          {r.matchedOption.name}
                          <span className="ml-1.5 text-xs text-[var(--text-muted)]">
                            재고 {formatNumber(r.matchedOption.availableStock)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">재고에서 못 찾음</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-strong)]">
                      {r.salePrice != null ? `${formatNumber(r.salePrice)}원` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-muted)]">
                      {cost != null ? `${formatNumber(cost)}원` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {margin != null ? (
                        <span
                          className={cn(
                            'font-semibold',
                            margin > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400',
                          )}
                        >
                          {formatNumber(margin)}원
                          {marginPct != null && <span className="ml-1 text-xs font-normal">({marginPct}%)</span>}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn('inline-block rounded px-2 py-0.5 text-xs font-medium', badge.cls)}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openSearch(r)}
                          className={cn(
                            'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium',
                            searchOpenId === r.id
                              ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
                              : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]',
                          )}
                        >
                          <Search className="h-3 w-3" /> 재고 찾기
                        </button>
                        {isReview && (
                          <>
                            <button
                              type="button"
                              onClick={() => setStatus(r, 'linked')}
                              disabled={patch.isPending}
                              className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-500/25 disabled:opacity-50 dark:text-emerald-400"
                            >
                              <Check className="h-3 w-3" /> 승인
                            </button>
                            <button
                              type="button"
                              onClick={() => setStatus(r, 'ignored')}
                              disabled={patch.isPending}
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
                            >
                              <X className="h-3 w-3" /> 무시
                            </button>
                          </>
                        )}
                        {r.matchStatus === 'unmatched' && (
                          <button
                            type="button"
                            onClick={() => setStatus(r, 'ignored')}
                            disabled={patch.isPending}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
                          >
                            <X className="h-3 w-3" /> 무시
                          </button>
                        )}
                        {(isDone || r.matchStatus === 'ignored') && (
                          <button
                            type="button"
                            onClick={() => setStatus(r, r.matchedOptionId ? 'suggested' : 'unmatched')}
                            disabled={patch.isPending}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
                          >
                            <RotateCcw className="h-3 w-3" /> 되돌리기
                          </button>
                        )}
                      </div>
                    </td>
                    </tr>
                    {searchOpenId === r.id && (
                      <tr className="border-b border-[var(--border)] bg-[var(--surface-sunken)]">
                        <td colSpan={8} className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium text-[var(--text-muted)]">재고 검색</span>
                            <input
                              value={keyword}
                              onChange={(e) => setKeyword(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void runSearch();
                              }}
                              placeholder="키워드 (예: 세탁기)"
                              className="w-48 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--text-strong)]"
                            />
                            <button
                              type="button"
                              onClick={() => void runSearch()}
                              disabled={searching}
                              className="inline-flex items-center gap-1 rounded-md bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
                            >
                              {searching ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Search className="h-3.5 w-3.5" />
                              )}
                              검색
                            </button>
                          </div>
                          <div className="mt-2 flex flex-col gap-1">
                            {results.length === 0 ? (
                              <div className="text-xs text-[var(--text-muted)]">
                                {searching ? '검색 중…' : '키워드로 재고를 검색해 연결하세요.'}
                              </div>
                            ) : (
                              results.map((o) => (
                                <div
                                  key={o.id}
                                  className="flex items-center justify-between gap-2 rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5"
                                >
                                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-strong)]" title={o.optionName}>
                                    {o.optionName}
                                    {o.isBundle && <span className="ml-1 text-xs text-[var(--text-muted)]">[번들]</span>}
                                    {o.barcode && (
                                      <span className="ml-1.5 font-mono text-xs text-[var(--text-muted)]">{o.barcode}</span>
                                    )}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => linkTo(r, o.id)}
                                    disabled={patch.isPending}
                                    className="inline-flex flex-none items-center gap-1 rounded bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-500/25 disabled:opacity-50 dark:text-emerald-400"
                                  >
                                    <Link2 className="h-3 w-3" /> 연결
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}
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
  tone?: 'default' | 'primary' | 'emerald' | 'muted';
}) {
  const toneClass: Record<string, string> = {
    default: 'text-[var(--text-strong)]',
    primary: 'text-[var(--primary)]',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    muted: 'text-[var(--text-muted)]',
  };
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className={cn('mt-1 text-lg font-semibold', toneClass[tone])}>{formatNumber(value)}</div>
    </div>
  );
}
