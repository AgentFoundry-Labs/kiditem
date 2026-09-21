import type { DashboardFindings } from '@kiditem/shared/dashboard';
import type { PipeInboxItem } from '@/app/agent-org/lib/pipe-model';

/**
 * 대시보드 맨 위의 '지금 할 일' — 흩어져 있던 긴급 · AI 발견 · AI 제안을 한 줄로 세운다.
 *
 * 화면은 무슨 일이 있었나가 아니라 **지금 내 손이 필요한 일**을 먼저 보여 준다(사장님 2026-09-20).
 * 여기서는 이미 다른 owner 가 발표한 사실만 줄로 바꾼다 — 새로 판단하지 않는다. 모르는 값은 줄을
 * 만들지 않는다(0으로 찍지 않는다).
 */

export type WorkQueueKind = 'blocked' | 'money' | 'decision';

export interface WorkQueueItem {
  key: string;
  kind: WorkQueueKind;
  /** 줄 앞 배지 — 무슨 종류의 일인가(막힘 · 재고 · 매출 · 쇼핑몰). */
  badge: string;
  title: string;
  /** 왜 이 줄이 떴는지 — 숫자로 말한다. */
  evidence: string | null;
  href: string;
  actionLabel: string;
  /** 이 일이 생긴 시각(ms). 같은 순위면 오래 기다린 것부터. 모르면 null. */
  since: number | null;
}

export interface WorkQueueCounts {
  /** 에이전트가 막혀 못 도는 일 — 사람이 풀어 줘야 한다. */
  blocked: number;
  /** 돈이 새는 일 — 발주 · 매출 하락. */
  money: number;
  /** 사장님 결정이 있어야 끝나는 일. */
  decision: number;
}

const ORDER: Record<WorkQueueKind, number> = { blocked: 0, money: 1, decision: 2 };

/** 몰 등록 반려는 '상품 등록' 화면에서 푼다. */
const REORDER_ROWS = 2;
const REGISTRATION_HREF = '/mall-listings';
const REORDER_HREF = '/inventory-hub';
const DECLINE_HREF = '/sales-analysis';

export function buildWorkQueue(input: {
  /** Agent Org 가 만든 긴급 목록(이미 원인별로 묶인 것). */
  inbox: readonly PipeInboxItem[];
  findings: DashboardFindings | undefined;
  /** 목록에 세울 최대 줄 수. 나머지는 '더 보기'로 넘긴다. */
  limit?: number;
}): { items: WorkQueueItem[]; counts: WorkQueueCounts; total: number } {
  const items: WorkQueueItem[] = [];

  // 1) 막힌 일 — 에이전트가 스스로 못 푸는 것. 이 브라우저에만 있는 값으로 선 줄은 숫자에 넣지
  //    않는다(다른 사람이 같은 숫자를 볼 수 없다) — 긴급 카드와 같은 규칙이다.
  for (const item of input.inbox) {
    items.push({
      key: `inbox:${item.key}`,
      kind: 'blocked',
      badge: '막힘',
      title: item.title,
      evidence: item.detail,
      href: item.href,
      actionLabel: '처리',
      since: item.lastAt > 0 ? item.lastAt : null,
    });
  }

  // 2) 돈이 새는 일 — 발주가 먼저다(품절은 되돌릴 수 없다).
  // 발주 제안은 여러 개가 한꺼번에 오는데, 목록을 독차지하면 결정할 일이 밀린다. 급한 둘만 세우고
  // 나머지는 전체 수에만 남긴다(재고 화면이 전부 보여 준다).
  const reorders = input.findings?.reorderSuggestions ?? [];
  for (const suggestion of reorders.slice(0, REORDER_ROWS)) {
    items.push({
      key: `reorder:${suggestion.productCode}`,
      kind: 'money',
      badge: '재고',
      title: `${suggestion.name} ${daysLeftLabel(suggestion.daysLeft)}`,
      evidence: `현재고 ${suggestion.availableStock.toLocaleString()}개 · 월 ${Math.round(suggestion.monthlyOutflow).toLocaleString()}개 나감`,
      href: REORDER_HREF,
      actionLabel: '발주 검토',
      since: null,
    });
  }

  const decline = input.findings?.salesDecline;
  if (decline?.count && decline.count > 0) {
    const worst = decline.items[0];
    items.push({
      key: 'decline',
      kind: 'money',
      badge: '매출',
      title: `주요 상품 ${decline.count}개가 덜 팔립니다`,
      evidence: worst
        ? `가장 큰 것: ${worst.name} ${Math.round(worst.changePercent)}% (${worst.baselineQty.toFixed(0)}개 → ${worst.recentQty}개)`
        : null,
      href: DECLINE_HREF,
      actionLabel: '분석',
      since: null,
    });
  }

  // 3) 사장님 결정 — 몰이 거절한 등록은 사람이 고쳐야 다시 올라간다.
  const failures = input.findings?.registrationFailures;
  if (failures && failures.count > 0) {
    const mall = failures.byChannel[0];
    items.push({
      key: 'registration-failures',
      kind: 'decision',
      badge: '쇼핑몰',
      title: `몰이 거절한 등록 ${failures.count}건`,
      evidence: mall ? `가장 많은 곳: ${mall.mallName} ${mall.count}건` : null,
      href: REGISTRATION_HREF,
      actionLabel: '확인',
      since: null,
    });
  }

  const sorted = [...items].sort((left, right) => ORDER[left.kind] - ORDER[right.kind]
    || (left.since ?? Number.POSITIVE_INFINITY) - (right.since ?? Number.POSITIVE_INFINITY));

  return {
    items: sorted.slice(0, input.limit ?? 5),
    counts: {
      blocked: countable(input.inbox).length,
      money: sorted.filter((item) => item.kind === 'money').length,
      decision: sorted.filter((item) => item.kind === 'decision').length,
    },
    total: sorted.length + Math.max(0, reorders.length - REORDER_ROWS),
  };
}

/** 머리 숫자에 넣는 긴급 — 이 브라우저에만 있는 값으로 선 줄은 뺀다. */
function countable(inbox: readonly PipeInboxItem[]): readonly PipeInboxItem[] {
  return inbox.filter((item) => !item.browserOnly);
}

function daysLeftLabel(daysLeft: number): string {
  if (daysLeft <= 0) return '오늘 품절됩니다';
  return `${daysLeft}일 뒤 품절됩니다`;
}
