import { describe, expect, it } from 'vitest';
import type { DashboardFindings } from '@kiditem/shared/dashboard';
import type { PipeInboxItem } from '@/app/agent-org/lib/pipe-model';
import { buildWorkQueue } from './work-queue';

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
    salesDecline: { month: null, keyProductLimit: 30, count: null, items: [] },
    reorderSuggestions: null,
    registrationFailures: { count: 0, byChannel: [] },
    ...overrides,
  } as DashboardFindings;
}

describe('buildWorkQueue', () => {
  it('막힌 일을 맨 위에 두고, 그 다음이 돈 새는 일 · 사장님 결정이다', () => {
    const queue = buildWorkQueue({
      inbox: [inboxItem()],
      findings: findings({
        reorderSuggestions: [{
          productCode: '10473', name: '잔디인형', optionName: null, masterProductId: null, imageUrl: null,
          availableStock: 58, monthlyOutflow: 1064, daysLeft: 3, reorderPoint: null,
        }],
        registrationFailures: { count: 31, byChannel: [{ channel: 'thirtymall', mallName: '떠리몰', count: 20 }] },
      }),
    });
    expect(queue.items.map((item) => item.kind)).toEqual(['blocked', 'money', 'decision']);
    expect(queue.counts).toEqual({ blocked: 1, money: 1, decision: 1 });
  });

  it('발주 줄은 왜 급한지를 숫자로 말한다', () => {
    const queue = buildWorkQueue({
      inbox: [],
      findings: findings({
        reorderSuggestions: [{
          productCode: '10473', name: '잔디인형', optionName: null, masterProductId: null, imageUrl: null,
          availableStock: 58, monthlyOutflow: 1064, daysLeft: 3, reorderPoint: null,
        }],
      }),
    });
    expect(queue.items[0]).toMatchObject({
      title: '잔디인형 3일 뒤 품절됩니다',
      evidence: '현재고 58개 · 월 1,064개 나감',
      actionLabel: '발주 검토',
    });
  });

  it('오늘 품절될 것은 날짜를 세지 않는다', () => {
    const queue = buildWorkQueue({
      inbox: [],
      findings: findings({
        reorderSuggestions: [{
          productCode: '1', name: '물총', optionName: null, masterProductId: null, imageUrl: null,
          availableStock: 3, monthlyOutflow: 300, daysLeft: 0, reorderPoint: null,
        }],
      }),
    });
    expect(queue.items[0]?.title).toBe('물총 오늘 품절됩니다');
  });

  it('막힌 일이 여럿이면 오래 기다린 것이 먼저다', () => {
    const queue = buildWorkQueue({
      inbox: [
        inboxItem({ key: 'new', title: '방금 생긴 일', lastAt: 1_600_000_100_000 }),
        inboxItem({ key: 'old', title: '이틀째 막힌 일', lastAt: 1_600_000_000_000 }),
      ],
      findings: findings(),
    });
    expect(queue.items.map((item) => item.title)).toEqual(['이틀째 막힌 일', '방금 생긴 일']);
  });

  it('이 브라우저에만 있는 값으로 선 줄은 머리 숫자에 넣지 않는다', () => {
    const queue = buildWorkQueue({
      inbox: [inboxItem(), inboxItem({ key: 'local', browserOnly: true })],
      findings: findings(),
    });
    expect(queue.counts.blocked).toBe(1);
    expect(queue.total).toBe(2);
  });

  it('모르는 값은 줄을 만들지 않는다 — 매출 하락이 측정 안 됐으면 비어 있다', () => {
    const queue = buildWorkQueue({ inbox: [], findings: findings() });
    expect(queue.items).toEqual([]);
    expect(queue.counts).toEqual({ blocked: 0, money: 0, decision: 0 });
  });

  it('발주 제안은 급한 둘만 세우고 나머지는 전체 수에만 남긴다 — 결정할 일이 밀리지 않게', () => {
    const suggestion = (code: string, daysLeft: number) => ({
      productCode: code, name: `상품${code}`, optionName: null, masterProductId: null, imageUrl: null,
      availableStock: 10, monthlyOutflow: 100, daysLeft, reorderPoint: null,
    });
    const queue = buildWorkQueue({
      inbox: [],
      findings: findings({
        reorderSuggestions: [suggestion('1', 1), suggestion('2', 2), suggestion('3', 3), suggestion('4', 4)],
        registrationFailures: { count: 5, byChannel: [] },
      }),
    });
    expect(queue.items.filter((item) => item.badge === '재고')).toHaveLength(2);
    expect(queue.items.some((item) => item.kind === 'decision')).toBe(true);
    expect(queue.total).toBe(5);
  });

  it('상한을 넘는 줄은 세우지 않지만 전체 수는 남긴다', () => {
    const queue = buildWorkQueue({
      inbox: [inboxItem({ key: 'a' }), inboxItem({ key: 'b' }), inboxItem({ key: 'c' })],
      findings: findings(),
      limit: 2,
    });
    expect(queue.items).toHaveLength(2);
    expect(queue.total).toBe(3);
  });

});
