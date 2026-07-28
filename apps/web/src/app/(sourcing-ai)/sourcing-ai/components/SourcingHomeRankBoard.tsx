'use client';

import Link from 'next/link';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

export interface RankItem {
  key: string;
  title: string;
  meta?: string;
  value?: string;
}

export interface RankColumn {
  label: string;
  count: number;
  accent: string;
  icon: LucideIcon;
  href: string;
  items: RankItem[];
  emptyText: string;
}

/**
 * 소싱 홈 · KPI 5열 랭킹 보드 (DataLab 인기 키워드 보드 스타일).
 * 각 열은 헤더(라벨 + 총 개수) + TOP 10 순위 리스트.
 */
export function SourcingHomeRankBoard({ columns }: { columns: RankColumn[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {columns.map((col) => (
        <RankColumnCard key={col.label} col={col} />
      ))}
    </div>
  );
}

function RankColumnCard({ col }: { col: RankColumn }) {
  const Icon = col.icon;
  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2.5">
        <Link
          href={col.href}
          className="flex min-w-0 items-center gap-1.5 transition-colors hover:text-purple-600"
        >
          <Icon size={15} style={{ color: col.accent }} />
          <span className="truncate text-sm font-semibold text-slate-900">{col.label}</span>
        </Link>
        <span
          className="shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums"
          style={{ background: `${col.accent}14`, color: col.accent }}
        >
          {formatNumber(col.count)}개
        </span>
      </div>
      {col.items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-slate-50/30 px-3 py-8">
          <p className="text-center text-[11px] font-medium leading-4 text-slate-400">{col.emptyText}</p>
          <Link
            href={col.href}
            className="inline-flex items-center gap-0.5 text-[11px] font-semibold transition-opacity hover:opacity-70"
            style={{ color: col.accent }}
          >
            바로가기
            <ArrowRight size={11} />
          </Link>
        </div>
      ) : (
        <ol className="divide-y divide-slate-100">
          {col.items.map((item, index) => (
            <li
              key={item.key}
              className="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-slate-50"
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold tabular-nums"
                style={{
                  background: index < 3 ? `${col.accent}12` : '#f8fafc',
                  color: index < 3 ? col.accent : '#94a3b8',
                }}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                {item.meta && <p className="truncate text-[11px] font-medium text-slate-400">{item.meta}</p>}
              </div>
              {item.value && (
                <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: col.accent }}>
                  {item.value}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
