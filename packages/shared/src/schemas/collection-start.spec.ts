import { describe, expect, it } from 'vitest';
import {
  COLLECTION_START_PRODUCERS,
  CollectionStartRequestSchema,
  CollectionStartResultSchema,
} from './collection-start';

const idempotencyKey = '3f1b8c3e-2a4d-4f7e-9c1a-5b6d7e8f9a0b';
const attemptId = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';
const channelAccountId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('collection start request', () => {
  it('covers the Coupang collection window producers and the Wing catalog import', () => {
    expect([...COLLECTION_START_PRODUCERS].sort()).toEqual([
      'advertising.ad_keyword',
      'advertising.ad_sync',
      'advertising.profitability_import',
      'channels.coupang_catalog',
      'dashboard.wing_kpi',
      'dashboard.wing_sales',
    ]);
  });

  it('accepts a catalog import only for exactly one channel account', () => {
    const catalog = (scope: unknown) =>
      CollectionStartRequestSchema.safeParse({
        action: 'startCollection',
        producer: 'channels.coupang_catalog',
        idempotencyKey,
        scope,
      }).success;
    expect(catalog({ channelAccountId })).toBe(true);
    expect(catalog({})).toBe(false);
    expect(catalog({ channelAccountId: 'not-a-uuid' })).toBe(false);
    expect(catalog({ channelAccountId, stage: 'basics' })).toBe(false);
  });

  it('accepts a campaign sweep with or without an account', () => {
    for (const scope of [{}, { channelAccountId }]) {
      expect(
        CollectionStartRequestSchema.safeParse({
          action: 'startCollection',
          producer: 'advertising.ad_sync',
          idempotencyKey,
          scope,
        }).success,
      ).toBe(true);
    }
  });

  it('accepts a manual campaign report whose range matches its period', () => {
    const base = { action: 'startCollection', producer: 'advertising.ad_sync', idempotencyKey };
    const manual = (scope: Record<string, unknown>) =>
      CollectionStartRequestSchema.safeParse({
        ...base,
        scope: { captureMode: 'manual_report', ...scope },
      }).success;
    expect(manual({ period: '7d', startDate: '2026-09-07', endDate: '2026-09-13' })).toBe(true);
    expect(
      manual({ channelAccountId, period: '1d', startDate: '2026-09-13', endDate: '2026-09-13' }),
    ).toBe(true);
    expect(manual({ period: '7d', startDate: '2026-09-08', endDate: '2026-09-13' })).toBe(false);
    expect(manual({ period: '1d', startDate: '2026-09-12', endDate: '2026-09-13' })).toBe(false);
    expect(manual({ period: '30d', startDate: '2026-08-15', endDate: '2026-09-13' })).toBe(false);
    expect(
      manual({
        period: '1d',
        startDate: '2026-09-13',
        endDate: '2026-09-13',
        targetUrl: 'https://advertising.coupang.com/report',
      }),
    ).toBe(false);
  });

  it('requires an ordered date range for Wing traffic', () => {
    const base = { action: 'startCollection', producer: 'dashboard.wing_sales', idempotencyKey };
    expect(
      CollectionStartRequestSchema.safeParse({
        ...base,
        scope: { startDate: '2026-09-01', endDate: '2026-09-13' },
      }).success,
    ).toBe(true);
    expect(CollectionStartRequestSchema.safeParse({ ...base, scope: {} }).success).toBe(false);
    expect(
      CollectionStartRequestSchema.safeParse({
        ...base,
        scope: { startDate: '2026-09-13', endDate: '2026-09-01' },
      }).success,
    ).toBe(false);
  });

  it('rejects unknown scope fields, other producers and a missing idempotency key', () => {
    expect(
      CollectionStartRequestSchema.safeParse({
        action: 'startCollection',
        producer: 'advertising.profitability_import',
        idempotencyKey,
        scope: { channelAccountId },
      }).success,
    ).toBe(false);
    expect(
      CollectionStartRequestSchema.safeParse({
        action: 'startCollection',
        producer: 'inventory.sellpia',
        idempotencyKey,
        scope: {},
      }).success,
    ).toBe(false);
    expect(
      CollectionStartRequestSchema.safeParse({
        action: 'startCollection',
        producer: 'dashboard.wing_kpi',
        scope: {},
      }).success,
    ).toBe(false);
  });
});

describe('collection start result', () => {
  it('reads a started, running or refused outcome', () => {
    expect(
      CollectionStartResultSchema.parse({
        success: true,
        outcome: 'started',
        producer: 'advertising.ad_sync',
        attemptId,
      }).outcome,
    ).toBe('started');
    expect(
      CollectionStartResultSchema.parse({
        success: true,
        outcome: 'running',
        producer: 'advertising.ad_sync',
        attemptId: null,
      }).outcome,
    ).toBe('running');
    const refused = CollectionStartResultSchema.parse({
      success: true,
      outcome: 'refused',
      producer: 'dashboard.wing_sales',
      holder: { producer: 'advertising.ad_sync', name: '쿠팡 광고 캠페인', attemptId },
      message: '쿠팡 광고 캠페인 수집이 수집 창을 쓰고 있습니다. 끝난 뒤 다시 시작해 주세요.',
    });
    expect(refused.outcome === 'refused' && refused.holder.name).toBe('쿠팡 광고 캠페인');
  });

  it('reads a catalog import refused by another account import in the same browser', () => {
    const refused = CollectionStartResultSchema.parse({
      success: true,
      outcome: 'refused',
      producer: 'channels.coupang_catalog',
      holder: { producer: 'channels.coupang_catalog', name: '키드아이템 계정의 쿠팡 상품 수집', attemptId },
      message:
        '키드아이템 계정의 쿠팡 상품 수집이 이 브라우저에서 진행 중입니다. 한 브라우저에서는 쿠팡 계정 하나씩 상품을 받을 수 있습니다. 끝난 뒤 다시 시작해 주세요.',
    });
    expect(refused.outcome === 'refused' && refused.holder.producer).toBe('channels.coupang_catalog');
  });

  it('does not accept a refusal without a holder name or message', () => {
    expect(
      CollectionStartResultSchema.safeParse({
        success: true,
        outcome: 'refused',
        producer: 'dashboard.wing_sales',
        holder: { producer: 'advertising.ad_sync', name: '', attemptId: null },
        message: '',
      }).success,
    ).toBe(false);
  });

  it('does not accept a started outcome without an attempt', () => {
    expect(
      CollectionStartResultSchema.safeParse({
        success: true,
        outcome: 'started',
        producer: 'advertising.ad_keyword',
        attemptId: null,
      }).success,
    ).toBe(false);
  });
});
