import { describe, expect, it } from 'vitest';
import {
  BrowserCollectionAttentionReasonSchema,
  BrowserCollectionCommandSchema,
  BrowserCollectionProducerSchema,
  BrowserCollectionSessionViewSchema,
  BrowserCollectionStateSchema,
} from './browser-collection-session';

const RUN_ID = '00000000-0000-4000-8000-000000000001';

const PRODUCERS = [
  'dashboard.wing_sales',
  'dashboard.rocket_sales',
  'dashboard.coupang_ads',
  'dashboard.coupang_products',
  'dashboard.wing_kpi',
  'advertising.ad_sync',
  'advertising.scrape_targets',
  'advertising.wing_rank',
  'advertising.keyword_rank',
  'advertising.competitor_catalog',
  'channels.coupang_catalog',
  'sourcing.1688_trend',
  'sourcing.live_commerce',
  'orders.mall',
] as const;

const STATES = [
  'idle',
  'running',
  'attention_required',
  'succeeded',
  'failed',
  'cancelled',
] as const;

const ATTENTION_REASONS = [
  'extension_missing',
  'kiditem_auth',
  'marketplace_login',
  'captcha',
  'permission',
  'background_timeout',
  'rate_limited',
  'manual_confirmation',
  'unknown',
] as const;

const createSession = () => ({
  runId: RUN_ID,
  producer: 'dashboard.wing_sales' as const,
  classification: 'background_preferred' as const,
  status: 'running' as const,
  attempt: 1,
  restartStrategy: 'extension' as const,
  progress: {
    current: 0,
    total: 30,
    completed: 0,
    failed: 0,
    label: '7/13',
  },
  inputIdentity: { targetCount: 30 },
  attention: null,
  startedAt: 1783958400000,
  updatedAt: 1783958401000,
  finishedAt: null,
});

describe('BrowserCollectionSessionViewSchema', () => {
  it('accepts a personal browser collection attention view without tab identity', () => {
    const parsed = BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      status: 'attention_required',
      attention: {
        reason: 'marketplace_login',
        message: 'Wing 로그인이 필요합니다.',
        canOpenTab: true,
      },
    });

    expect(parsed.status).toBe('attention_required');
    expect(parsed).not.toHaveProperty('managedTabId');
  });

  it('accepts every approved producer', () => {
    for (const producer of PRODUCERS) {
      expect(BrowserCollectionProducerSchema.parse(producer)).toBe(producer);
    }
  });

  it('accepts every approved state with its required related fields', () => {
    for (const status of STATES) {
      const terminal = ['succeeded', 'failed', 'cancelled'].includes(status);
      const attention = status === 'attention_required'
        ? {
            reason: 'manual_confirmation' as const,
            message: '확인이 필요합니다.',
            canOpenTab: true,
          }
        : null;

      expect(BrowserCollectionSessionViewSchema.parse({
        ...createSession(),
        status,
        attention,
        finishedAt: terminal ? 1783958402000 : null,
      }).status).toBe(status);
      expect(BrowserCollectionStateSchema.parse(status)).toBe(status);
    }
  });

  it('accepts every approved attention reason', () => {
    for (const reason of ATTENTION_REASONS) {
      expect(BrowserCollectionAttentionReasonSchema.parse(reason)).toBe(reason);
      expect(BrowserCollectionSessionViewSchema.parse({
        ...createSession(),
        status: 'attention_required',
        attention: {
          reason,
          message: '확인이 필요합니다.',
          canOpenTab: true,
        },
      }).attention?.reason).toBe(reason);
    }
  });

  it('rejects unknown keys throughout the public view', () => {
    expect(() => BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      unexpected: true,
    })).toThrow();
    expect(() => BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      progress: { ...createSession().progress, unexpected: true },
    })).toThrow();
    expect(() => BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      status: 'attention_required',
      attention: {
        reason: 'captcha',
        message: 'Captcha 확인이 필요합니다.',
        canOpenTab: true,
        unexpected: true,
      },
    })).toThrow();
  });

  it('rejects invalid progress bounds', () => {
    expect(() => BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      progress: { ...createSession().progress, current: 31 },
    })).toThrow('Invalid progress bounds');
    expect(() => BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      progress: {
        ...createSession().progress,
        completed: 20,
        failed: 11,
      },
    })).toThrow('Invalid progress bounds');
  });

  it('requires a UUID run identity', () => {
    expect(() => BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      runId: 'not-a-uuid',
    })).toThrow();
  });

  it('rejects browser tab identities and secret input identities', () => {
    expect(() => BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      managedTabId: 123,
    })).toThrow();
    expect(() => BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      browserTabId: 123,
    })).toThrow();
    expect(() => BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      inputIdentity: { accessToken: 'secret' },
    })).toThrow('Secret identity field is not allowed: accessToken');
    expect(() => BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      inputIdentity: { sourcePayload: 'raw input' },
    })).toThrow('Secret identity field is not allowed: sourcePayload');
  });

  it('keeps input identity values primitive and bounded', () => {
    expect(BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      inputIdentity: {
        targetCount: 30,
        query: 'kids shoes',
        enabled: true,
        category: null,
      },
    }).inputIdentity).toEqual({
      targetCount: 30,
      query: 'kids shoes',
      enabled: true,
      category: null,
    });
    expect(() => BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      inputIdentity: { nested: { raw: 'input' } },
    })).toThrow();
    expect(() => BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      inputIdentity: { query: 'x'.repeat(501) },
    })).toThrow();
    expect(() => BrowserCollectionSessionViewSchema.parse({
      ...createSession(),
      inputIdentity: Object.fromEntries(
        Array.from({ length: 21 }, (_, index) => [`field${index}`, index]),
      ),
    })).toThrow('Too many identity fields');
  });
});

describe('BrowserCollectionCommandSchema', () => {
  it('accepts only explicit collection control commands', () => {
    expect(BrowserCollectionCommandSchema.parse({
      action: 'openCollectionAttentionTab',
      runId: RUN_ID,
    })).toEqual({ action: 'openCollectionAttentionTab', runId: RUN_ID });
    expect(() => BrowserCollectionCommandSchema.parse({
      action: 'focusAnyTab',
      runId: RUN_ID,
    })).toThrow();
  });

  it.each([
    { action: 'listCollectionSessions' },
    { action: 'getCollectionSession', runId: RUN_ID },
    { action: 'cancelCollectionSession', runId: RUN_ID },
    { action: 'openCollectionAttentionTab', runId: RUN_ID },
    { action: 'restartCollectionSession', runId: RUN_ID },
  ])('accepts the $action command', (command) => {
    expect(BrowserCollectionCommandSchema.parse(command)).toEqual(command);
  });

  it('rejects unknown command keys and non-UUID run identities', () => {
    expect(() => BrowserCollectionCommandSchema.parse({
      action: 'listCollectionSessions',
      unexpected: true,
    })).toThrow();
    expect(() => BrowserCollectionCommandSchema.parse({
      action: 'getCollectionSession',
      runId: 'not-a-uuid',
    })).toThrow();
  });
});
