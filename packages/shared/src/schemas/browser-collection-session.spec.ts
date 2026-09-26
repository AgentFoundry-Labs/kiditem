import { describe, expect, it } from 'vitest';
import {
  BROWSER_COLLECTION_ATTENTION_REASONS,
  BROWSER_COLLECTION_PRODUCERS,
  BrowserCollectionAttentionReasonSchema,
  BrowserCollectionAttemptIdSchema,
  BrowserCollectionCommandSchema,
  BrowserCollectionProducerSchema,
  BrowserCollectionSessionViewSchema,
} from './browser-collection-session';

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';

const createSession = () => ({
  attemptId: ATTEMPT_ID,
  producer: 'inventory.sellpia' as const,
  progress: {
    current: 0,
    total: 30,
    completed: 0,
    failed: 0,
    label: null,
  },
  attention: null,
});

describe('BrowserCollectionSessionViewSchema', () => {
  it('correlates a session with the owner attempt and has no second lifecycle', () => {
    const parsed = BrowserCollectionSessionViewSchema.parse(createSession());

    expect(parsed.attemptId).toBe(ATTEMPT_ID);
    expect(parsed).not.toHaveProperty('status');
    expect(parsed).not.toHaveProperty('restartStrategy');
    expect(parsed).not.toHaveProperty('attempt');
    expect(parsed).not.toHaveProperty('runId');
    expect(parsed).not.toHaveProperty('inputIdentity');
    expect(parsed).not.toHaveProperty('finishedAt');
  });

  it('accepts an optional environment owner without exposing managed-tab identity', () => {
    const parsed = BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      environmentId: 'office',
    });

    expect(parsed.environmentId).toBe('office');
    expect(parsed).not.toHaveProperty('managedTabId');
    expect(parsed).not.toHaveProperty('managedWindowId');
  });

  it('accepts every approved producer and attention reason', () => {
    expect(BROWSER_COLLECTION_PRODUCERS).toEqual([
      'advertising.ad_keyword',
      'advertising.ad_sync',
      'advertising.profitability_import',
      'advertising.competitor_catalog',
      'advertising.competitor_seller_identity',
      'advertising.keyword_rank',
      'advertising.wing_rank',
      'advertising.wing_tracked_products',
      'channels.coupang_catalog',
      'dashboard.coupang_products',
      'inventory.sellpia',
      'orders.mall',
      'orders.mall_admin_listings',
      'orders.sabangnet_mall_listings',
      'orders.sellpia_manual_match',
      'orders.sellpia_product_profitability',
      'orders.sellpia_sales',
    ]);
    for (const producer of BROWSER_COLLECTION_PRODUCERS) {
      expect(BrowserCollectionProducerSchema.parse(producer)).toBe(producer);
    }
    for (const reason of BROWSER_COLLECTION_ATTENTION_REASONS) {
      expect(BrowserCollectionAttentionReasonSchema.parse(reason)).toBe(reason);
    }
  });

  it('rejects retired advertising account-day KPI producers', () => {
    for (const producer of [
      'advertising.ad_account_daily_kpi',
      'dashboard.coupang_ads',
    ]) {
      expect(BrowserCollectionProducerSchema.safeParse(producer).success).toBe(false);
      expect(BrowserCollectionSessionViewSchema.safeParse({
        ...createSession(),
        producer,
      }).success).toBe(false);
    }
  });

  it('requires bounded progress and attention details', () => {
    expect(BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      progress: {
        current: 3,
        total: 5,
        completed: 2,
        failed: 1,
        label: '상품 수집 중',
      },
      attention: {
        reason: 'marketplace_login',
        message: 'Sellpia 로그인이 필요합니다.',
        canOpenTab: true,
      },
    }).attention?.reason).toBe('marketplace_login');

    expect(() => BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      progress: { ...createSession().progress, current: 31 },
    })).toThrow('Invalid progress bounds');
    expect(() => BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      progress: { ...createSession().progress, completed: 30, failed: 1 },
    })).toThrow('Invalid progress bounds');
    expect(() => BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      attention: {
        reason: 'captcha',
        message: '',
        canOpenTab: true,
      },
    })).toThrow();
  });

  it('requires an owner attempt UUID and rejects unknown public fields', () => {
    expect(BrowserCollectionAttemptIdSchema.parse(ATTEMPT_ID)).toBe(ATTEMPT_ID);
    expect(() => BrowserCollectionAttemptIdSchema.parse('not-a-uuid')).toThrow();
    expect(() => BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      status: 'running',
    })).toThrow();
    expect(() => BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      managedTabId: 123,
    })).toThrow();
  });
});

describe('BrowserCollectionCommandSchema', () => {
  it('exposes only list/get/cancel/open-attention commands', () => {
    expect(BrowserCollectionCommandSchema.parse({
      action: 'listCollectionSessions',
    })).toEqual({ action: 'listCollectionSessions' });
    expect(BrowserCollectionCommandSchema.parse({
      action: 'getCollectionSession',
      attemptId: ATTEMPT_ID,
    })).toEqual({ action: 'getCollectionSession', attemptId: ATTEMPT_ID });
    expect(BrowserCollectionCommandSchema.parse({
      action: 'cancelCollectionSession',
      attemptId: ATTEMPT_ID,
    })).toEqual({ action: 'cancelCollectionSession', attemptId: ATTEMPT_ID });
    expect(BrowserCollectionCommandSchema.parse({
      action: 'openCollectionAttentionTab',
      attemptId: ATTEMPT_ID,
    })).toEqual({ action: 'openCollectionAttentionTab', attemptId: ATTEMPT_ID });
  });

  it('rejects terminal/restart commands and legacy run IDs', () => {
    expect(() => BrowserCollectionCommandSchema.parse({
      action: 'restartCollectionSession',
      attemptId: ATTEMPT_ID,
    })).toThrow();
    expect(() => BrowserCollectionCommandSchema.parse({
      action: 'finalizeCollectionSession',
      attemptId: ATTEMPT_ID,
      status: 'succeeded',
      message: 'done',
    })).toThrow();
    expect(() => BrowserCollectionCommandSchema.parse({
      action: 'getCollectionSession',
      runId: ATTEMPT_ID,
    })).toThrow();
  });
});
