import { describe, expect, it, vi } from 'vitest';
import { AgentApiStartupReconciler } from './agent-api-startup-reconciler.service';

describe('AgentApiStartupReconciler', () => {
  it('runs API boot recovery exactly once without provider-session restoration', async () => {
    const attempts = { reconcile: vi.fn(async () => ({ reconciled: 1 })) };
    const startup = new AgentApiStartupReconciler(attempts as never);
    await expect(startup.onApplicationBootstrap()).resolves.toEqual({ reconciled: 1 });
    expect(attempts.reconcile).toHaveBeenCalledTimes(1);
  });
});
