import { describe, expect, it } from 'vitest';
import {
  isExpiredRunningExecutionTask,
  isManualAdActionType,
  isOpenExecutionTask,
} from '../execution-task-lifecycle';

const NOW = new Date('2026-09-15T06:00:00.000Z');
const startedMinutesAgo = (minutes: number, extraMs = 0) =>
  new Date(NOW.getTime() - minutes * 60_000 - extraMs);

describe('isExpiredRunningExecutionTask', () => {
  it('expires a running attempt only once it started more than 30 minutes ago', () => {
    expect(
      isExpiredRunningExecutionTask({ status: 'running', startedAt: startedMinutesAgo(30) }, NOW),
    ).toBe(false);
    expect(
      isExpiredRunningExecutionTask({ status: 'running', startedAt: startedMinutesAgo(30, 1) }, NOW),
    ).toBe(true);
  });

  it('expires a running attempt that carries no start time, since nothing can still be reporting for it', () => {
    expect(isExpiredRunningExecutionTask({ status: 'running', startedAt: null }, NOW)).toBe(true);
  });

  it.each(['queued', 'done', 'failed', 'cancelled'])('never expires a %s attempt', (status) => {
    expect(
      isExpiredRunningExecutionTask({ status, startedAt: startedMinutesAgo(60) }, NOW),
    ).toBe(false);
  });
});

describe('isOpenExecutionTask', () => {
  it('keeps only queued attempts and running attempts within their deadline open', () => {
    expect(
      [
        null,
        { status: 'queued', startedAt: null },
        { status: 'running', startedAt: startedMinutesAgo(29) },
        { status: 'running', startedAt: startedMinutesAgo(31) },
        { status: 'running', startedAt: null },
        { status: 'done', startedAt: startedMinutesAgo(1) },
        { status: 'failed', startedAt: startedMinutesAgo(1) },
        { status: 'cancelled', startedAt: null },
      ].map((task) => isOpenExecutionTask(task, NOW)),
    ).toEqual([false, true, true, false, false, false, false, false]);
  });
});

describe('isManualAdActionType', () => {
  it('names keyword pauses, bid changes and daily budget changes, and nothing else (KID-138 decision A)', () => {
    expect(
      [
        'pause_keyword',
        'change_bid',
        'change_daily_budget',
        'create_campaign',
        'pause_campaign',
        'PAUSE_KEYWORD',
        '',
      ].filter(isManualAdActionType),
    ).toEqual(['pause_keyword', 'change_bid', 'change_daily_budget']);
  });
});
