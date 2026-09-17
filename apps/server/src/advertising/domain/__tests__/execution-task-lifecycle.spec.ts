import { describe, expect, it } from 'vitest';
import {
  isExpiredRunningExecutionTask,
  isManualAdActionType,
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

describe('resolveExecutionReport', () => {
  const LATEST = 'task-latest';
  const latestTask = (status: string, startedAt: Date | null = startedMinutesAgo(5)) => ({
    id: LATEST,
    status,
    startedAt,
  });
  // The browser extension still executes campaign registration.
  const EXECUTED_TYPE = 'create_campaign';

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
        EXECUTED_TYPE,
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
            EXECUTED_TYPE,
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
        EXECUTED_TYPE,
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
            EXECUTED_TYPE,
            latestTask(latest, startedAt),
            { executionTaskId: 'task-older', status: reported },
            NOW,
          ),
        ).toBe('not_latest_attempt');
      }
    },
  );

  describe.each(['pause_keyword', 'change_bid', 'change_daily_budget'])(
    'for a %s action, which the extension never applies (KID-138 decision A)',
    (manualType) => {
      const decide = (
        latest: ReturnType<typeof latestTask> | null,
        status: 'running' | 'done' | 'failed',
        executionTaskId = LATEST,
      ) => resolveExecutionReport(manualType, latest, { executionTaskId, status }, NOW);

      it.each([
        // An executor claiming a queued attempt, such as one data migration 011
        // left from an approval before decision A, never gets to write.
        ['queued', 'running', 'manual_action'],
        ['queued', 'done', 'manual_action'],
        ['running', 'running', 'manual_action'],
        ['running', 'done', 'manual_action'],
        ['done', 'done', 'manual_action'],
        ['done', 'running', 'manual_action'],
        ['failed', 'running', 'manual_action'],
        ['failed', 'done', 'manual_action'],
        ['cancelled', 'running', 'manual_action'],
        // A failure report changes nothing in the ad center and follows the lifecycle.
        ['queued', 'failed', 'apply'],
        ['running', 'failed', 'apply'],
        ['failed', 'failed', 'replay'],
        ['done', 'failed', 'invalid_transition'],
        ['cancelled', 'failed', 'invalid_transition'],
      ] as const)('latest task %s, reported %s for it → %s', (latest, reported, decision) => {
        expect(decide(latestTask(latest), reported)).toBe(decision);
      });

      it('still refuses a report for an older attempt, or for none, before anything else', () => {
        for (const reported of ['running', 'done', 'failed'] as const) {
          expect(decide(latestTask('queued'), reported, 'task-older')).toBe('not_latest_attempt');
          expect(decide(null, reported)).toBe('not_latest_attempt');
        }
      });

      it('still refuses a report for a running attempt past its deadline as expired', () => {
        for (const reported of ['running', 'done', 'failed'] as const) {
          expect(decide(latestTask('running', startedMinutesAgo(30, 1)), reported)).toBe('expired');
          expect(decide(latestTask('running', null), reported)).toBe('expired');
        }
      });
    },
  );
});
