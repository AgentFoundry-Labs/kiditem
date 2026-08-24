import { describe, expect, it, vi } from 'vitest';
import { AgentAttemptReconciler } from './agent-attempt-reconciler.service';

describe('AgentAttemptReconciler', () => {
  it('coalesces concurrent same-SHA recovery into one durable reconciliation and one capacity release per Attempt', async () => {
    const work = {
      reconcile: vi.fn(async () => ({ reconciled: 2, attemptIds: ['attempt-a', 'attempt-b'] })),
    };
    const capacity = { releaseAttempt: vi.fn() };
    const reconciler = new AgentAttemptReconciler(
      work as never,
      capacity,
      { applicationVersion: '3.4.5', gitSha: 'a'.repeat(40) },
      () => new Date('2026-08-24T00:00:00.000Z'),
    );

    await expect(Promise.all([reconciler.reconcile(), reconciler.reconcile()]))
      .resolves.toEqual([
        { reconciled: 2, attemptIds: ['attempt-a', 'attempt-b'] },
        { reconciled: 2, attemptIds: ['attempt-a', 'attempt-b'] },
      ]);

    expect(work.reconcile).toHaveBeenCalledTimes(1);
    expect(capacity.releaseAttempt).toHaveBeenCalledTimes(2);
    expect(capacity.releaseAttempt).toHaveBeenCalledWith('attempt-a');
    expect(capacity.releaseAttempt).toHaveBeenCalledWith('attempt-b');
  });
});
