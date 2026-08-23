import { describe, expect, it, vi } from 'vitest';
import { AgentAttemptReconciler } from './agent-attempt-reconciler.service';
import { AgentRuntimeDirectoryReconciler } from './agent-runtime-directory-reconciler.service';

describe('same-SHA Agent work reconciliation', () => {
  it('interrupts only matching live attempts, releases local capacity, and cleans their owned transient directories', async () => {
    const reconcile = vi.fn().mockResolvedValue({ reconciled: 2, attemptIds: ['attempt-1', 'attempt-2'] });
    const releaseAttempt = vi.fn();
    const terminate = vi.fn().mockResolvedValue(undefined);
    const cleanAttempt = vi.fn().mockResolvedValue(undefined);
    const directories = new AgentRuntimeDirectoryReconciler({ cleanAttempt });
    const service = new AgentAttemptReconciler(
      { reconcile } as never,
      { releaseAttempt },
      { terminate },
      directories,
      { applicationVersion: '1.0.0', gitSha: 'a'.repeat(40) },
      () => new Date('2030-01-01T00:00:00.000Z'),
    );

    await expect(service.reconcile()).resolves.toEqual({ reconciled: 2, attemptIds: ['attempt-1', 'attempt-2'] });
    expect(reconcile).toHaveBeenCalledWith({
      applicationVersion: '1.0.0', authorizingGitSha: 'a'.repeat(40), now: new Date('2030-01-01T00:00:00.000Z'),
    });
    expect(releaseAttempt).toHaveBeenCalledWith('attempt-1');
    expect(terminate).toHaveBeenCalledWith('attempt-1');
    expect(releaseAttempt).toHaveBeenCalledWith('attempt-2');
    expect(cleanAttempt).toHaveBeenCalledWith('attempt-1');
    expect(cleanAttempt).toHaveBeenCalledWith('attempt-2');
  });
});
