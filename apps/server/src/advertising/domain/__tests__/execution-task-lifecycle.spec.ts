import { describe, expect, it } from 'vitest';
import {
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
    ['running', 'running', 'replay'],
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
