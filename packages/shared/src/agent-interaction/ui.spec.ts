import { describe, expect, it } from 'vitest';
import { InteractionUiResultSchema } from './ui';

const observedAt = '2026-08-13T00:00:00.000Z';
const expiresAt = '2026-08-13T00:05:00.000Z';

const results = [
  {
    kind: 'metric_group',
    title: '오늘 운영 요약',
    items: [
      { key: 'revenue', label: '매출', value: 120000, format: 'krw', trend: null },
    ],
    freshness: { observedAt, label: '오늘' },
    textFallback: '오늘 매출은 120,000원입니다.',
  },
  {
    kind: 'notice',
    tone: 'warning',
    title: '재고 위험',
    body: '재고가 임계치보다 낮습니다.',
    textFallback: '재고가 임계치보다 낮습니다.',
  },
  {
    kind: 'resource_list',
    title: '확인할 상품',
    items: [
      {
        label: '상품 A',
        description: '재고 2개',
        resourceRef: { kind: 'product', id: 'product-1', version: '7' },
      },
    ],
    textFallback: '확인할 상품은 상품 A입니다.',
  },
  {
    kind: 'comparison',
    title: '전주 대비',
    columns: ['이번 주', '지난 주'],
    rows: [{ label: '매출', values: ['120,000원', '100,000원'] }],
    textFallback: '매출은 전주 대비 20,000원 증가했습니다.',
  },
  {
    kind: 'navigation',
    actionId: '11111111-1111-4111-8111-111111111111',
    routeKey: 'inventory_stock_ops',
    resourceRef: { kind: 'product', id: 'product-1', version: null },
    label: '재고 작업으로 이동',
    disabledReason: null,
    expiresAt,
    textFallback: '재고 작업으로 이동할 수 있습니다.',
  },
  {
    kind: 'suggested_replies',
    messageId: 'message-1',
    replies: [
      { id: 'reply-1', label: '자세히 보기', content: '재고 위험을 자세히 보여줘' },
    ],
    textFallback: '재고 위험을 자세히 확인할 수 있습니다.',
  },
] as const;

describe('InteractionUiResultSchema', () => {
  it.each(results)('accepts the registered $kind result', (result) => {
    expect(InteractionUiResultSchema.parse(result)).toEqual(result);
  });

  it('allows at most three bounded suggested replies', () => {
    const suggestion = results[5];
    expect(() => InteractionUiResultSchema.parse({
      ...suggestion,
      replies: Array.from({ length: 4 }, (_, index) => ({
        id: `reply-${index}`,
        label: '추천',
        content: '추천 질문',
      })),
    })).toThrow();
    expect(() => InteractionUiResultSchema.parse({
      ...suggestion,
      replies: [{ id: 'reply', label: 'x'.repeat(81), content: '질문' }],
    })).toThrow();
  });

  it('rejects raw URLs and model-authored component, style, class, or action authority', () => {
    for (const authority of [
      { url: 'https://attacker.example' },
      { href: '/admin' },
      { component: 'AdminPanel' },
      { style: { display: 'none' } },
      { className: 'fixed inset-0' },
      { action: 'delete_all' },
    ]) {
      expect(() => InteractionUiResultSchema.parse({
        ...results[4],
        ...authority,
      })).toThrow();
    }
  });

  it('allows only registered route keys and canonical resource references', () => {
    expect(() => InteractionUiResultSchema.parse({
      ...results[4],
      routeKey: 'https://attacker.example',
    })).toThrow();
    expect(() => InteractionUiResultSchema.parse({
      ...results[4],
      resourceRef: { kind: 'product', id: 'product-1', version: null, url: '/products/1' },
    })).toThrow();
    expect(() => InteractionUiResultSchema.parse({
      ...results[4],
      actionId: 'not-a-uuid',
    })).toThrow();
    expect(() => InteractionUiResultSchema.parse({
      ...results[4],
      expiresAt: 'tomorrow',
    })).toThrow();
  });

  it('requires nonempty bounded text fallback for every registered result', () => {
    for (const result of results) {
      expect(() => InteractionUiResultSchema.parse({ ...result, textFallback: '' })).toThrow();
      expect(() => InteractionUiResultSchema.parse({
        ...result,
        textFallback: 'x'.repeat(2_001),
      })).toThrow();
    }
  });

  it('rejects unknown top-level and nested fields and bounds collection sizes', () => {
    expect(() => InteractionUiResultSchema.parse({ ...results[0], debug: true })).toThrow();
    expect(() => InteractionUiResultSchema.parse({
      ...results[0],
      items: [{ ...results[0].items[0], component: 'MetricCard' }],
    })).toThrow();
    expect(() => InteractionUiResultSchema.parse({
      ...results[2],
      items: Array.from({ length: 21 }, (_, index) => ({
        label: `상품 ${index}`,
        description: null,
        resourceRef: { kind: 'product', id: `product-${index}`, version: null },
      })),
    })).toThrow();
  });
});
