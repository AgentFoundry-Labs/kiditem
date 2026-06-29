import { describe, expect, it } from 'vitest';
import type { ReadinessCheck, ReadinessResponse } from '@kiditem/shared/readiness';
import {
  buildReadinessModalViewModel,
  getLocalDateKey,
  shouldAutoOpen,
} from './readiness-modal-model';

function check(overrides: Partial<ReadinessCheck>): ReadinessCheck {
  return {
    key: 'wing_sales',
    label: 'Wing sales',
    status: 'missing',
    detail: 'Missing yesterday data',
    lastSyncedAt: null,
    count: null,
    collector: 'extension',
    collectEndpoint: null,
    scrapeUrls: ['https://example.com'],
    referenceDate: '2026-06-28',
    expectedDates: ['2026-06-27', '2026-06-28'],
    missingDates: ['2026-06-28'],
    ...overrides,
  };
}

function response(checks: ReadinessCheck[], allOk = false): ReadinessResponse {
  return { checks, allOk };
}

describe('readiness modal model', () => {
  it('formats the local date key without UTC drift', () => {
    expect(getLocalDateKey(new Date(2026, 5, 29, 1, 2, 3))).toBe('2026-06-29');
  });

  it('auto-opens only for extension collection issues in collection mode', () => {
    const serverIssue = response([
      check({ collector: 'server', collectEndpoint: '/api/collect', scrapeUrls: null }),
    ]);
    const extensionIssue = response([check({ status: 'stale', missingDates: [] })]);

    expect(shouldAutoOpen(serverIssue, 'collectionIssue')).toBe(false);
    expect(shouldAutoOpen(extensionIssue, 'collectionIssue')).toBe(true);
    expect(shouldAutoOpen(response([], true), 'anyIssue')).toBe(false);
  });

  it('builds display counts and separates action checks from ready checks', () => {
    const ready = check({
      key: 'coupang_ads',
      label: 'Ads',
      status: 'ok',
      detail: 'Ready',
      lastSyncedAt: '2026-06-28T00:00:00.000Z',
      missingDates: [],
      scrapeUrls: null,
    });
    const data = response([ready, check({ key: 'wing_sales' }), check({ key: 'wing_kpi', status: 'stale' })]);

    expect(buildReadinessModalViewModel(data)).toMatchObject({
      doneCount: 1,
      totalCount: 3,
      pendingCount: 2,
      progressRatio: 1 / 3,
      headline: '2개만 업데이트하면 돼요',
      subhead: '어제까지의 숫자를 채워두면 오늘 대시보드가 정확해져요.',
      actionChecks: [data.checks[1], data.checks[2]],
      okChecks: [ready],
    });
  });
});
