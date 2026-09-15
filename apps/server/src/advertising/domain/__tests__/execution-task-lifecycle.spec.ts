import { describe, expect, it } from 'vitest';
import {
  isExpiredRunningExecutionTask,
  isOpenExecutionTask,
  resolveExecutionReport,
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

describe('resolveExecutionReport', () => {
  const LATEST = 'task-latest';
  const latestTask = (status: string, startedAt: Date | null = startedMinutesAgo(5)) => ({
    id: LATEST,
    status,
    startedAt,
  });

  it.each([
    // An action without an attempt has nothing a report could name.
    [null, 'running', 'not_latest_attempt'],
    [null, 'done', 'not_latest_attempt'],
    [null, 'failed', 'not_latest_attempt'],
    ['queued', 'running', 'apply'],
    ['queued', 'done', 'apply'],
    ['queued', 'failed', 'apply'],
    // The extension never repeats a running report the server applied, so a
    // second one comes from another executor and must not reach Coupang.
    ['running', 'running', 'invalid_transition'],
    ['running', 'done', 'apply'],
    ['running', 'failed', 'apply'],
    ['done', 'done', 'replay'],
    ['done', 'failed', 'invalid_transition'],
    ['done', 'running', 'invalid_transition'],
    ['failed', 'failed', 'replay'],
    ['failed', 'done', 'invalid_transition'],
    ['failed', 'running', 'invalid_transition'],
    ['cancelled', 'running', 'invalid_transition'],
    ['cancelled', 'failed', 'invalid_transition'],
    // The retired worker lease word is not a reportable attempt.
    ['leased', 'running', 'invalid_transition'],
  ] as const)('latest task %s, reported %s for it → %s', (latest, reported, decision) => {
    expect(
      resolveExecutionReport(
        latest === null ? null : latestTask(latest),
        { executionTaskId: LATEST, status: reported },
        NOW,
      ),
    ).toBe(decision);
  });

  it.each(['running', 'done', 'failed'] as const)(
    'refuses a %s report for a running attempt past its deadline as expired',
    (reported) => {
      for (const startedAt of [startedMinutesAgo(30, 1), null]) {
        expect(
          resolveExecutionReport(
            latestTask('running', startedAt),
            { executionTaskId: LATEST, status: reported },
            NOW,
          ),
        ).toBe('expired');
      }
    },
  );

  it('still takes an outcome report for a running attempt exactly at its deadline', () => {
    expect(
      resolveExecutionReport(
        latestTask('running', startedMinutesAgo(30)),
        { executionTaskId: LATEST, status: 'done' },
        NOW,
      ),
    ).toBe('apply');
  });

  it.each([
    ['queued', null],
    ['running', startedMinutesAgo(5)],
    ['running', startedMinutesAgo(45)],
    ['done', startedMinutesAgo(5)],
    ['failed', startedMinutesAgo(5)],
    ['cancelled', null],
  ] as const)(
    'refuses a report naming an older attempt while the latest one is %s (started %s)',
    (latest, startedAt) => {
      for (const reported of ['running', 'done', 'failed'] as const) {
        expect(
          resolveExecutionReport(
            latestTask(latest, startedAt),
            { executionTaskId: 'task-older', status: reported },
            NOW,
          ),
        ).toBe('not_latest_attempt');
      }
    },
  );
});
