'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Bot, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardCardHeader, DashboardHeaderLink } from './DashboardCardHeader';
import { DashboardBasisDisclosure, type DashboardMetricBasis } from './DashboardDataBasis';
import { DashboardProductThumb } from './DashboardProductThumb';
import type { AiSuggestion } from '../lib/ai-suggestions';

/**
 * AI 제안 — 지금 하면 돈이 되는 일을 두 장씩 넘겨 본다(사장님 2026-09-20).
 *
 * 제안은 `lib/ai-suggestions` 가 이미 발표된 읽기(findings · 상품 요약 · 몰 연결 수)를 줄로
 * 바꾼 것이다. 이 칸은 넘기기만 한다 — 아무것도 세거나 예측하지 않는다.
 */

const PER_PAGE = 2;
const REORDER_HREF = '/product-hub?inventoryFocus=reorder';

const BADGE_TONE: Record<AiSuggestion['badge'], string> = {
  발주: 'bg-red-50 text-red-600 ring-red-100',
  기회: 'bg-violet-50 text-violet-700 ring-violet-100',
  매출: 'bg-amber-50 text-amber-700 ring-amber-100',
  쇼핑몰: 'bg-sky-50 text-sky-700 ring-sky-100',
};

export function DashboardAiSuggestion({
  suggestions,
  basis,
  isLoading,
  isError,
  className,
}: {
  /** 빈 배열이면 지금 권할 일이 없다. */
  suggestions: readonly AiSuggestion[];
  basis?: DashboardMetricBasis | null;
  isLoading: boolean;
  isError: boolean;
  className?: string;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(suggestions.length / PER_PAGE));
  const current = Math.min(page, pageCount - 1);
  const shown = suggestions.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);

  return (
    <section
      aria-label="AI 제안"
      className={cn('flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)}
      data-testid="dashboard-ai-suggestion"
    >
      <DashboardCardHeader
        icon={Bot}
        tone="violet"
        title="AI 제안"
        meta={suggestions.length > 0 ? (
          <span className="ml-1 text-xs font-normal tabular-nums text-slate-400">{suggestions.length}건</span>
        ) : undefined}
      >
        {pageCount > 1 ? (
          <span className="mr-1 inline-flex items-center gap-0.5">
            <button
              type="button"
              aria-label="이전 제안"
              onClick={() => setPage((value) => (value - 1 + pageCount) % pageCount)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:border-violet-300 hover:text-violet-700"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              type="button"
              aria-label="다음 제안"
              onClick={() => setPage((value) => (value + 1) % pageCount)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:border-violet-300 hover:text-violet-700"
            >
              <ChevronRight size={13} />
            </button>
          </span>
        ) : null}
        <DashboardHeaderLink href={REORDER_HREF}>더보기</DashboardHeaderLink>
        <DashboardBasisDisclosure
          label="AI 제안 근거"
          entries={[{ label: '발주 예측', basis }]}
          meaning={(
            <p>
              발주 제안은 셀피아 상품별 소진이 발주가 필요하다고 판정했고 아직 재고가 남은 상품입니다.
              남은 날은 지금 재고를 최근 두 달의 월평균 판매로 나눈 개월 수를 날로 옮긴 값입니다(한 달 = 30일).
              몰 연결 없음 · 품절 · 매출 하락 · 등록 실패는 각각 상품별 쇼핑몰 연결 현황, 상품 관리 요약, 대시보드
              findings 가 발표한 수를 그대로 옮긴 것입니다.
            </p>
          )}
        />
      </DashboardCardHeader>

      {isLoading ? (
        <p className="flex flex-1 items-center justify-center px-4 py-12 text-sm text-slate-400">제안을 찾는 중입니다.</p>
      ) : isError ? (
        <p className="flex flex-1 items-center justify-center px-4 py-12 text-sm text-red-600">제안을 읽지 못했습니다.</p>
      ) : shown.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-4 py-12 text-center text-sm text-slate-400">
          지금 서둘러 할 일이 없습니다.
        </p>
      ) : (
        <>
          <ul className="grid flex-1 grid-cols-1 gap-3 p-3 sm:grid-cols-2">
            {shown.map((item) => <SuggestionCard key={item.key} item={item} />)}
          </ul>
          {pageCount > 1 ? (
            <div className="flex flex-none items-center justify-center gap-1 pb-2.5" aria-hidden>
              {Array.from({ length: pageCount }, (_, index) => (
                <span
                  key={index}
                  className={cn('h-1.5 rounded-full transition-all', index === current ? 'w-4 bg-violet-600' : 'w-1.5 bg-slate-200')}
                />
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function SuggestionCard({ item }: { item: AiSuggestion }) {
  return (
    <li>
      <Link
        href={item.action.href}
        className="group flex h-full min-h-[7.5rem] flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/40 p-3 transition-colors hover:border-violet-300 hover:bg-white"
        data-testid={`dashboard-ai-suggestion-${item.key}`}
      >
        <span className="flex items-center gap-1.5">
          <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset', BADGE_TONE[item.badge])}>
            {item.badge}
          </span>
          {item.figureNote ? <span className="truncate text-[11px] text-slate-400">{item.figureNote}</span> : null}
        </span>

        <span className="flex min-w-0 flex-1 items-start gap-2.5">
          {item.imageUrl ? (
            <DashboardProductThumb imageUrl={item.imageUrl} name={item.headline} />
          ) : (
            <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-violet-100/70" aria-hidden>
              <Sparkles size={14} className="text-violet-600" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-900">{item.headline}</span>
            {item.evidence ? (
              <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-slate-500">{item.evidence}</span>
            ) : null}
          </span>
          {item.figure ? (
            <span className="flex-none text-right text-[15px] font-bold leading-none tabular-nums text-violet-700">{item.figure}</span>
          ) : null}
        </span>

        <span className="inline-flex w-fit items-center gap-1 self-end rounded-md bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors group-hover:bg-violet-700">
          {item.action.label}
          <ArrowRight size={11} aria-hidden />
        </span>
      </Link>
    </li>
  );
}
