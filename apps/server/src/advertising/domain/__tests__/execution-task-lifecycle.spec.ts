import { describe, expect, it } from 'vitest';
import {
  ABANDONED_RUNNING_EXECUTION_MS,
  isAbandonedRunningExecutionTask,
  isOpenExecutionTaskStatus,
  resolveExecutionReport,
} from '../execution-task-lifecycle';

describe('resolveExecutionReport', () => {
  it.each([
    [null, 'running', 'conflict'],
    [null, 'done', 'conflict'],
    [null, 'failed', 'conflict'],
    ['queued', 'running', 'apply'],
    ['queued', 'done', 'apply'],
    ['queued', 'failed', 'apply'],
    // The extension never repeats a running report the server applied, so a
    // second one comes from another executor and must not reach Coupang.
    ['running', 'running', 'conflict'],
    ['running', 'done', 'apply'],
    ['running', 'failed', 'apply'],
    ['done', 'done', 'replay'],
    ['done', 'failed', 'conflict'],
    ['done', 'running', 'conflict'],
    ['failed', 'failed', 'replay'],
    ['failed', 'done', 'conflict'],
    ['failed', 'running', 'conflict'],
    ['cancelled', 'running', 'conflict'],
    ['cancelled', 'failed', 'conflict'],
    // The retired worker lease word is not a reportable attempt.
    ['leased', 'running', 'conflict'],
  ] as const)('latest task %s, reported %s → %s', (latest, reported, decision) => {
    expect(resolveExecutionReport(latest, reported)).toBe(decision);
  });
});

describe('isOpenExecutionTaskStatus', () => {
  it('treats only queued and running attempts as open', () => {
    expect(
      ['queued', 'running', 'done', 'failed', 'cancelled', null, undefined].map(
        isOpenExecutionTaskStatus,
      ),
    ).toEqual([true, true, false, false, false, false, false]);
  });
});

describe('isAbandonedRunningExecutionTask', () => {
  const now = new Date('2026-09-14T12:00:00.000Z');
  const startedAgo = (ms: number) => new Date(now.getTime() - ms);

  it('abandons a running attempt once 30 minutes pass without an outcome report', () => {
    expect(ABANDONED_RUNNING_EXECUTION_MS).toBe(30 * 60 * 1000);
    expect(
      isAbandonedRunningExecutionTask(
        { status: 'running', startedAt: startedAgo(ABANDONED_RUNNING_EXECUTION_MS - 1) },
        now,
      ),
    ).toBe(false);
    expect(
      isAbandonedRunningExecutionTask(
        { status: 'running', startedAt: startedAgo(ABANDONED_RUNNING_EXECUTION_MS) },
        now,
      ),
    ).toBe(true);
  });

  it('treats a running attempt with no start time as abandoned', () => {
    expect(isAbandonedRunningExecutionTask({ status: 'running', startedAt: null }, now)).toBe(true);
  });

  it('never abandons an attempt that is not running', () => {
    const dayAgo = startedAgo(24 * 60 * 60 * 1000);
    expect(
      ['queued', 'done', 'failed', 'cancelled'].map((status) =>
        isAbandonedRunningExecutionTask({ status, startedAt: dayAgo }, now),
      ),
    ).toEqual([false, false, false, false]);
  });
});
