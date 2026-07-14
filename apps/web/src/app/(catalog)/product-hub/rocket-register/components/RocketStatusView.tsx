'use client';

import { useMemo, useState } from 'react';
import { Loader2, Rocket, Search } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { useRocketStatus } from '../hooks/useWingCatalog';
import type { RocketStatusRow } from '../lib/rocket-register-db-api';

type StatusFilter = 'unregistered' | 'registered' | 'all';

const FILTER_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'unregistered', label: '로켓 미등록' },
  { key: 'registered', label: '로켓 등록' },
  { key: 'all', label: '전체' },
];

/**
 * 쿠팡 로켓 등록/미등록 현황 (마스터 단위, 실제 상품).
 * 로켓 카탈로그(우리가 받아온 로켓 등록 상품) 기준으로 우리 상품이 이미 로켓에 있는지 판정.
 * 미등록 = 로켓에 아직 없는 상품(등록 후보) — 공급가·쿠팡가(WING)·마진으로 등록 우선순위 판단.
 */
export function RocketStatusView() {
  const status = useRocketStatus();
  const [filter, setFilter] = useState<StatusFilter>('unregistered');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => status.data?.items ?? [], [status.data]);
  const total = status.data?.total ?? 0;
  const registered = status.data?.registered ?? 0;
  const unregistered = status.data?.unregistered ?? 0;

  const visible = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'registered' && !r.registered) return false;
      if (filter === 'unregistered' && r.registered) return false;
      if (kw && !r.masterName.toLowerCase().includes(kw) && !r.masterCode.toLowerCase().includes(kw)) {
        return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  return (
    <div>
      <p className="mb-4 text-sm text-[var(--text-muted)]">
        우리가 받아온 <b>로켓 카탈로그</b> 기준으로, 실제 상품(옵션 있는 마스터)이 이미 로켓에 등록됐는지 봅니다.
        <b> 로켓 미등록</b>이 등록 후보 — WING 마진 큰 순 정렬. <b className="text-[var(--text-strong)]">WING가</b>=쿠팡 3P 판매가(기본단위 최저),{' '}
        <b className="text-[var(--text-strong)]">로켓가</b>=로켓 매입 단가(발주 기준)로 <b>서로 다른 가격</b>입니다.
      </p>

      {/* 요약 */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <SummaryCard label="실제 상품" value={total} />
        <SummaryCard label="로켓 등록" value={registered} tone="emerald" />
        <SummaryCard label="로켓 미등록" value={unregistered} tone="amber" />
      </div>

      {/* 필터 + 검색 */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
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
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="상품명 · 코드 검색"
            className="w-56 rounded border border-[var(--border)] bg-[var(--surface-sunken)] py-1.5 pl-7 pr-2 text-sm text-[var(--text-strong)]"
          />
        </div>
      </div>

      {/* 테이블 */}
      {status.isLoading ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--text-muted)]">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--text-muted)]">
          {total === 0
            ? 'WING 매칭 탭에서 WING 불러오기를 먼저 실행하세요. (로켓 카탈로그가 있어야 판정됩니다)'
            : '해당 조건의 상품이 없습니다.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]">
            {formatNumber(visible.length)}개 표시
          </div>
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-3 py-2 font-medium">상품명</th>
                <th className="px-3 py-2 text-right font-medium">옵션</th>
                <th className="px-3 py-2 text-right font-medium">공급가</th>
                <th className="px-3 py-2 text-right font-medium">WING가</th>
                <th className="px-3 py-2 text-right font-medium">로켓가</th>
                <th className="px-3 py-2 text-right font-medium">마진</th>
                <th className="px-3 py-2 font-medium">로켓</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <RocketStatusRowItem key={r.masterId} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RocketStatusRowItem({ row: r }: { row: RocketStatusRow }) {
  const marginPct = r.margin != null && r.wingPrice ? Math.round((r.margin / r.wingPrice) * 100) : null;
  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="max-w-[320px] px-3 py-2">
        <div className="truncate text-[var(--text-strong)]" title={r.masterName}>
          {r.masterName}
        </div>
        <div className="truncate font-mono text-[11px] text-[var(--text-muted)]">{r.masterCode}</div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{formatNumber(r.optionCount)}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-muted)]">
        {r.costPrice != null ? `${formatNumber(r.costPrice)}원` : '-'}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-strong)]">
        {r.wingPrice != null ? `${formatNumber(r.wingPrice)}원` : '-'}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-strong)]">
        {r.rocketPrice != null ? `${formatNumber(r.rocketPrice)}원` : '-'}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">
        {r.margin != null ? (
          <span
            className={cn(
              'font-semibold',
              r.margin > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
            )}
          >
            {formatNumber(r.margin)}원
            {marginPct != null && <span className="ml-1 text-xs font-normal">({marginPct}%)</span>}
          </span>
        ) : (
          <span className="text-[var(--text-muted)]">-</span>
        )}
      </td>
      <td className="px-3 py-2">
        {r.registered ? (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Rocket className="h-3 w-3" /> 등록
          </span>
        ) : (
          <span className="inline-block rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            미등록
          </span>
        )}
      </td>
    </tr>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'emerald' | 'amber';
}) {
  const toneClass: Record<string, string> = {
    default: 'text-[var(--text-strong)]',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
  };
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className={cn('mt-1 text-lg font-semibold', toneClass[tone])}>{formatNumber(value)}</div>
    </div>
  );
}
