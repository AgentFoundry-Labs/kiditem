import Link from 'next/link';
import { ArrowRight, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { DashboardBasisDisclosure, type BasisBreakdownEntry } from './DashboardDataBasis';
import {
  DASHBOARD_TONE,
  DashboardCardHeader,
  DashboardHeaderLink,
  DashboardIconBadge,
  type DashboardTone,
} from './DashboardCardHeader';

/**
 * AI가 발견한 문제 — 사람이 손봐야 할 것을 영역마다 한 칸씩.
 *
 * 수는 페이지가 원천 읽기에서 골라 넘긴다(재고는 상품 관리 요약, 매출 하락 · 등록 실패는
 * 대시보드 findings). 이 칸은 세지 않고, 칸마다 그 일을 처리하는 화면으로 바로 간다.
 * 모르는 수는 0 이 아니라 '—' 와 그 이유다.
 */

export interface DashboardIssue {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: DashboardTone;
  /** 모르면 null. */
  count: number | null;
  /** 수 아래 한 줄 — 무엇을 셌는지, 모르면 왜 모르는지. */
  description: string;
  action: { label: string; href: string };
}

function IssueTile({ issue }: { issue: DashboardIssue }) {
  const active = issue.count !== null && issue.count > 0;
  return (
    <li
      className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-slate-50/50 p-3.5"
      data-testid={`dashboard-issue-${issue.key}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <DashboardIconBadge icon={issue.icon} tone={issue.tone} />
        <span className="truncate text-[13px] font-semibold text-slate-700">{issue.label}</span>
      </div>
      <p className="mt-3 flex items-baseline gap-1">
        {issue.count === null ? (
          <span className="text-2xl font-bold leading-none text-slate-300">—</span>
        ) : (
          <>
            <span
              className={cn(
                'text-2xl font-bold leading-none tracking-tight tabular-nums',
                active ? DASHBOARD_TONE[issue.tone].text : 'text-slate-900',
              )}
            >
              {formatNumber(issue.count)}
            </span>
            <span className="text-sm font-semibold text-slate-500">개</span>
          </>
        )}
      </p>
      <p className="mb-3 mt-1.5 line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-slate-500" title={issue.description}>
        {issue.description}
      </p>
      <Link
        href={issue.action.href}
        className="mt-auto inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
      >
        {issue.action.label}
        <ArrowRight size={12} aria-hidden />
      </Link>
    </li>
  );
}

export function DashboardAiIssues({
  issues,
  basis,
  className,
}: {
  issues: readonly DashboardIssue[];
  /** 칸마다 그 수의 근거 — 헤더의 ⓘ 가 보여 준다. */
  basis: readonly BasisBreakdownEntry[];
  className?: string;
}) {
  const known = issues.filter((issue) => issue.count !== null);
  const total = known.reduce((sum, issue) => sum + (issue.count ?? 0), 0);
  return (
    <section
      aria-label="AI가 발견한 문제"
      className={cn('flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)}
      data-testid="dashboard-ai-issues"
    >
      <DashboardCardHeader
        icon={TriangleAlert}
        tone="red"
        title="AI가 발견한 문제"
        meta={known.length > 0 ? (
          <span
            className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-red-600 ring-1 ring-inset ring-red-100"
            title="확인한 영역의 문제 수를 더한 값입니다. 모르는 영역은 빠집니다."
          >
            {formatNumber(total)}개 항목
          </span>
        ) : null}
      >
        <DashboardHeaderLink href="/agent-org">더보기</DashboardHeaderLink>
        <DashboardBasisDisclosure
          label="AI가 발견한 문제 근거"
          entries={basis}
          meaning={(
            <p>
              재고 부족은 상품 관리가 발주가 필요하다고 본 상품(재고 카드의 품절 임박과 같은 수), 매출
              하락은 직전 석 달 월매출 상위 상품 가운데 지난달 판매가 그 석 달 평균의 80% 이하로 떨어진
              상품, 상품 등록 실패는 몰이 반려한 활성 리스팅입니다. 고객 문의는 아직 모으지 않아
              CS 미응답은 셀 수 없습니다.
            </p>
          )}
        />
      </DashboardCardHeader>
      <ul className="grid flex-1 grid-cols-2 gap-3 p-4 lg:grid-cols-4 xl:grid-cols-2 min-[1440px]:grid-cols-4">
        {issues.map((issue) => <IssueTile key={issue.key} issue={issue} />)}
      </ul>
    </section>
  );
}
