import { describe, expect, it } from 'vitest';
import type { SellpiaInventoryFreshnessWithBlockers } from '@/lib/sellpia-inventory-freshness-api';
import {
  classifySellpiaStockSync,
  describeSellpiaStockSync,
} from './sellpia-sync-outcome';

const NOW = Date.parse('2026-07-27T02:47:00.000Z');

function view(
  overrides: Partial<SellpiaInventoryFreshnessWithBlockers> = {},
): SellpiaInventoryFreshnessWithBlockers {
  return {
    status: 'refresh_required',
    sourceBinding: {
      origin: 'https://kiditem.sellpia.com',
      accountKey: 'kiditem',
      confirmed: true,
    },
    lastVerifiedAt: '2026-07-26T14:39:31.669Z',
    expiresAt: '2026-07-26T14:49:31.669Z',
    requestedGeneration: '178',
    verifiedGeneration: '174',
    refreshRequestedAt: '2026-07-27T00:19:52.476Z',
    refreshReason: 'order_transmission_requested',
    syncNotBefore: null,
    activeSync: null,
    lastAttempt: null,
    unresolvedOrderTransmissionIntents: [],
    hasMoreUnresolvedOrderTransmissionIntents: false,
    ...overrides,
  };
}

describe('classifySellpiaStockSync', () => {
  it('classifies the actual sync state while a transmission is unresolved', () => {
    const outcome = classifySellpiaStockSync(view({
      status: 'syncing',
      unresolvedOrderTransmissionIntents: [
        {
          intentKey: '1785076954061-kidsnote-browser',
          preparedAt: '2026-07-26T14:42:38.482Z',
        },
      ],
    }), NOW);

    expect(outcome).toEqual({ kind: 'running' });
    expect(describeSellpiaStockSync(outcome)).toEqual({
      tone: 'success',
      message: '셀피아 데이터를 수집하고 있습니다.',
    });
  });

  it('keeps a queued refresh available while a transmission is unresolved', () => {
    const outcome = classifySellpiaStockSync(view({
      syncNotBefore: '2026-07-27T02:49:06.324Z',
      unresolvedOrderTransmissionIntents: [
        { intentKey: 'orders-1', preparedAt: '2026-07-26T14:42:38.482Z' },
      ],
    }), NOW);

    expect(outcome).toEqual({ kind: 'queued', startsInMs: 126_324 });
  });

  it('surfaces the remaining settle window when a sync is genuinely queued', () => {
    const outcome = classifySellpiaStockSync(view({
      syncNotBefore: '2026-07-27T02:49:06.324Z',
    }), NOW);

    expect(outcome).toEqual({ kind: 'queued', startsInMs: 126_324 });
    expect(describeSellpiaStockSync(outcome)).toEqual({
      tone: 'success',
      message: '셀피아 동기화 요청을 보냈습니다. 약 127초 후 시작합니다.',
    });
  });

  it('does not report a past settle window as a wait', () => {
    const outcome = classifySellpiaStockSync(view({
      syncNotBefore: '2026-07-27T02:40:00.000Z',
    }), NOW);

    expect(outcome).toEqual({ kind: 'queued', startsInMs: 0 });
    expect(describeSellpiaStockSync(outcome).message)
      .toBe('셀피아 동기화 요청을 보냈습니다. 곧 시작합니다.');
  });

  it('reports a running collection and an already-fresh snapshot distinctly', () => {
    expect(classifySellpiaStockSync(view({ status: 'syncing' }), NOW))
      .toEqual({ kind: 'running' });
    expect(classifySellpiaStockSync(view({ status: 'fresh' }), NOW))
      .toEqual({ kind: 'fresh' });
  });

  it('carries the last failure message when the previous attempt failed', () => {
    const outcome = classifySellpiaStockSync(view({
      status: 'failed',
      lastAttempt: {
        attemptedAt: '2026-07-26T14:39:31.669Z',
        status: 'failed',
        trigger: 'manual_request',
        errorCode: 'sellpia_login_required',
        errorMessage: '셀피아 로그인이 필요합니다.',
      },
    }), NOW);

    expect(outcome).toEqual({
      kind: 'stalled',
      errorMessage: '셀피아 로그인이 필요합니다.',
    });
    expect(describeSellpiaStockSync(outcome).tone).toBe('error');
  });

  it('reports a failed request when the refresh call itself threw', () => {
    expect(classifySellpiaStockSync(null, NOW)).toEqual({ kind: 'request_failed' });
    expect(describeSellpiaStockSync({ kind: 'request_failed' }).tone).toBe('error');
  });
});
