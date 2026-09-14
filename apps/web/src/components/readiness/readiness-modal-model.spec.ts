import { describe, expect, it } from 'vitest';
import type { ReadinessCheck, ReadinessResponse } from '@kiditem/shared/readiness';
import { buildSnapshotBasis } from '@kiditem/shared/dashboard';
import {
  buildReadinessModalViewModel,
  getLocalDateKey,
  shouldAutoOpen,
} from './readiness-modal-model';

function check(overrides: Partial<ReadinessCheck>): ReadinessCheck {
  return {
    key: 'wing_sales',
    label: 'Wing sales',
    basis: buildSnapshotBasis({
      asOf: null,
      requiredAsOf: '2026-06-28',
      measured: false,
      sources: ['test'],
    }),
    detail: 'Missing yesterday data',
    lastSyncedAt: null,
    count: null,
    referenceDate: '2026-06-28',
    expectedDates: ['2026-06-27', '2026-06-28'],
    missingDates: ['2026-06-28'],
    ...overrides,
  };
}

function response(checks: ReadinessCheck[]): ReadinessResponse {
  return { checks };
}

describe('readiness modal model', () => {
  it('formats the local date key without UTC drift', () => {
    expect(getLocalDateKey(new Date(2026, 5, 29, 1, 2, 3))).toBe('2026-06-29');
  });

  it('auto-opens for collection issues in collection mode', () => {
    const extensionIssue = response([check({
      basis: buildSnapshotBasis({
        asOf: '2026-06-27',
        requiredAsOf: '2026-06-28',
        sources: ['test'],
      }),
      missingDates: [],
    })]);

    expect(shouldAutoOpen(extensionIssue, 'collectionIssue')).toBe(true);
    expect(shouldAutoOpen(response([]), 'anyIssue')).toBe(false);
  });

  it('builds display counts and separates action checks from ready checks', () => {
    const ready = check({
      key: 'coupang_ads',
      label: 'Ads',
      basis: buildSnapshotBasis({
        asOf: '2026-06-28',
        requiredAsOf: '2026-06-28',
        sources: ['test'],
      }),
      detail: 'Ready',
      lastSyncedAt: '2026-06-28T00:00:00.000Z',
      missingDates: [],
    });
    const data = response([ready, check({ key: 'wing_sales' }), check({
      key: 'wing_kpi',
      basis: buildSnapshotBasis({
        asOf: '2026-06-27',
        requiredAsOf: '2026-06-28',
        sources: ['test'],
      }),
    })]);

    expect(buildReadinessModalViewModel(data)).toMatchObject({
      allOk: false,
      doneCount: 1,
      totalCount: 3,
      pendingCount: 2,
      progressRatio: 1 / 3,
      headline: '데이터 상태를 확인해 보세요',
      subhead: '누락된 데이터는 아래에서 확인할 수 있어요. 지금도 대시보드를 볼 수 있어요.',
      actionChecks: [data.checks[1], data.checks[2]],
      okChecks: [ready],
    });
  });

  it('removes a retired Rocket check from cached payloads and readiness arithmetic', () => {
    const rocket = check({
      key: 'rocket_sales',
      label: '쿠팡 로켓',
      basis: buildSnapshotBasis({
        asOf: '2026-06-27',
        requiredAsOf: '2026-06-28',
        sources: ['test'],
      }),
      missingDates: [],
    });
    const ready = check({
      key: 'coupang_ads',
      label: 'Ads',
      basis: buildSnapshotBasis({
        asOf: '2026-06-28',
        requiredAsOf: '2026-06-28',
        sources: ['test'],
      }),
      missingDates: [],
    });
    const data = response([rocket, ready]);

    expect(shouldAutoOpen(data, 'anyIssue')).toBe(false);
    expect(shouldAutoOpen(data, 'collectionIssue')).toBe(false);
    expect(buildReadinessModalViewModel(data)).toMatchObject({
      checks: [ready],
      allOk: true,
      doneCount: 1,
      totalCount: 1,
      pendingCount: 0,
      headline: 'AI 가 직접 운영합니다',
    });
  });
});
