import { describe, expect, it } from 'vitest';
import type { PipeInboxItem } from '@/lib/agent-org/pipe-model';
import { buildWorkQueue } from './work-queue';
import type { DashboardFindings } from '@kiditem/shared/dashboard';

function inboxItem(overrides: Partial<PipeInboxItem> = {}): PipeInboxItem {
  return {
    key: 'mall-login',
    state: 'failed',
    title: '몰 주문 수집 실패',
    detail: '보리보리 로그인이 막혔습니다',
    count: 1,
    stageIds: [],
    lastAt: 1_600_000_000_000,
    href: '/order-collection',
    ...overrides,
  } as PipeInboxItem;
}

function findings(overrides: Partial<DashboardFindings> = {}): DashboardFindings {
  return {
    productSalesCapturedAt: null,
    reorderProductCount: null,
    salesDecline: { month: null, keyProductLimit: 30, count: null, items: [] },
    reorderSuggestions: null,
    registrationFailures: { count: 0, byChannel: [] },
    ...overrides,
  } as DashboardFindings;
}

describe('buildWorkQueue', () => {
  it('uses the owner-published stock and monthly outflow in reorder evidence', () => {
    const queue = buildWorkQueue({
      inbox: [],
      findings: findings({
        reorderSuggestions: [{
          productCode: '10473', name: '잔디인형', optionName: null, masterProductId: null, imageUrl: null,
          availableStock: 58, monthlyOutflow: 1_064, daysLeft: 3, reorderPoint: null,
        }],
      }),
    });

    expect(queue.items[0]).toMatchObject({
      title: '잔디인형 3일 뒤 품절됩니다',
      evidence: '현재고 58개 · 월 1,064개 나감',
      actionLabel: '발주 검토',
    });
  });

  it('orders blocked, money, and decision work without adding unknown findings', () => {
    const queue = buildWorkQueue({
      inbox: [inboxItem()],
      findings: findings({
        salesDecline: {
          month: '2026-08',
          keyProductLimit: 30,
          count: 1,
          items: [{
            productCode: '10473', name: '잔디인형', optionName: null, masterProductId: null, imageUrl: null,
            recentQty: 2, baselineQty: 10, changePercent: -80,
          }],
        },
        reorderSuggestions: [
          {
            productCode: '3189', name: '세계지도 만국기', optionName: null, masterProductId: null,
            imageUrl: null, availableStock: 58, monthlyOutflow: 1_064, daysLeft: 3, reorderPoint: null,
          },
          {
            productCode: '3190', name: '투톤슬라임', optionName: null, masterProductId: null,
            imageUrl: null, availableStock: 22, monthlyOutflow: 330, daysLeft: 2, reorderPoint: null,
          },
          {
            productCode: '3191', name: '미니블록', optionName: null, masterProductId: null,
            imageUrl: null, availableStock: 14, monthlyOutflow: 210, daysLeft: 1, reorderPoint: null,
          },
        ],
        registrationFailures: { count: 2, byChannel: [{ channel: 'mall', mallName: '몰', count: 2 }] },
      }),
    });

    expect(queue.items.map((item) => item.kind)).toEqual(['blocked', 'money', 'money', 'money', 'decision']);
    expect(queue.items.find((item) => item.badge === '매출')).toMatchObject({
      evidence: '가장 큰 것: 잔디인형 -80% (10개 → 2개)',
    });
    expect(queue.items.find((item) => item.kind === 'decision')).toMatchObject({
      title: '등록 실패 2건',
    });
    expect(queue.counts).toEqual({ blocked: 1, money: 4, decision: 1 });
    expect(queue.total).toBe(6);
  });

  it('does not count browser-only blocked work in the summary', () => {
    const queue = buildWorkQueue({
      inbox: [inboxItem(), inboxItem({ key: 'local', browserOnly: true })],
      findings: findings(),
    });

    expect(queue.counts.blocked).toBe(1);
    expect(queue.total).toBe(2);
  });
});
