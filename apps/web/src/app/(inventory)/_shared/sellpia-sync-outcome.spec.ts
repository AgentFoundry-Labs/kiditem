import { describe, expect, it } from 'vitest';
import type { SellpiaInventoryCollectionStatusWithBlockers } from '@/lib/sellpia-inventory-freshness-api';
import {
  classifySellpiaStockSync,
  describeSellpiaStockSync,
} from './sellpia-sync-outcome';

function view(
  overrides: Partial<SellpiaInventoryCollectionStatusWithBlockers> = {},
): SellpiaInventoryCollectionStatusWithBlockers {
  return {
    status: 'not_collected',
    sourceBinding: {
      origin: 'https://kiditem.sellpia.com',
      accountKey: 'kiditem',
      confirmed: true,
    },
    requestedGeneration: '178',
    verifiedGeneration: '0',
    lastCompletedAttemptId: null,
    lastCompletedAt: null,
    lastAttemptId: null,
    activeSync: null,
    lastAttempt: null,
    ...overrides,
  };
}

describe('classifySellpiaStockSync', () => {
  it('classifies a running collection', () => {
    const outcome = classifySellpiaStockSync(view({ status: 'running' }));
    expect(outcome).toEqual({ kind: 'running' });
    expect(describeSellpiaStockSync(outcome)).toEqual({
      tone: 'success',
      message: '셀피아 데이터를 수집하고 있습니다.',
    });
  });

  it('reports a completed snapshot without an age window', () => {
    const outcome = classifySellpiaStockSync(view({
      status: 'complete',
      requestedGeneration: '178',
      verifiedGeneration: '178',
      lastCompletedAttemptId: '00000000-0000-4000-8000-000000000001',
      lastCompletedAt: '2020-01-01T00:00:00.000Z',
      lastAttemptId: '00000000-0000-4000-8000-000000000001',
    }));
    expect(outcome).toEqual({ kind: 'complete' });
    expect(describeSellpiaStockSync(outcome)).toEqual({
      tone: 'success',
      message: '셀피아 데이터 수집이 완료되었습니다.',
    });
  });

  it('surfaces the last failure message', () => {
    const outcome = classifySellpiaStockSync(view({
      status: 'failed',
      lastAttemptId: '00000000-0000-4000-8000-000000000002',
      lastAttempt: {
        attemptedAt: '2026-07-26T14:39:31.669Z',
        trigger: 'manual_request',
        scope: 'inventory',
        errorCode: 'sellpia_login_required',
        errorMessage: '셀피아 로그인이 필요합니다.',
      },
    }));
    expect(outcome).toEqual({
      kind: 'stalled',
      errorMessage: '셀피아 로그인이 필요합니다.',
    });
  });

  it('reports a missing status response as a request failure', () => {
    expect(classifySellpiaStockSync(null)).toEqual({ kind: 'request_failed' });
    expect(describeSellpiaStockSync({ kind: 'request_failed' }).tone).toBe('error');
  });
});
