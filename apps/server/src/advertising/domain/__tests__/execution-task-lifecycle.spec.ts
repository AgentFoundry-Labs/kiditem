import { describe, expect, it } from 'vitest';
import {
  isOpenExecutionTaskStatus,
  resolveExecutionReport,
} from '../execution-task-lifecycle';

describe('resolveExecutionReport', () => {
  const LATEST = 'task-latest';

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
        latest === null ? null : { id: LATEST, status: latest },
        { executionTaskId: LATEST, status: reported },
      ),
    ).toBe(decision);
  });

  it.each(['queued', 'running', 'done', 'failed', 'cancelled'])(
    'refuses a report naming an older attempt while the latest one is %s',
    (latest) => {
      for (const reported of ['running', 'done', 'failed'] as const) {
        expect(
          resolveExecutionReport(
            { id: LATEST, status: latest },
            { executionTaskId: 'task-older', status: reported },
          ),
        ).toBe('not_latest_attempt');
      }
    },
  );
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
