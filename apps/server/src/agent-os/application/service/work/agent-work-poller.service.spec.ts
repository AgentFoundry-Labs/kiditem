import { describe, expect, it, vi } from 'vitest';
import { AgentWorkPollerService } from './agent-work-poller.service';

describe('AgentWorkPollerService', () => {
  it('contains polling failures so a timer rejection cannot escape the worker root', async () => {
    const error = new Error('database unavailable');
    const poller = new AgentWorkPollerService(
      { dispatchOne: vi.fn().mockResolvedValue(false) } as never,
      { expire: vi.fn() } as never,
      { findDueApprovals: vi.fn().mockRejectedValue(error) } as never,
    );

    await expect(poller.onApplicationBootstrap()).resolves.toBeUndefined();
    poller.onModuleDestroy();
  });
});
