import { describe, expect, it, vi } from 'vitest';
import { BrowserOperationRuntimeController } from '../browser-operation-runtime.controller';

const RUN_ID = '11111111-1111-4111-8111-111111111111';

describe('BrowserOperationRuntimeController', () => {
  it('returns the replacement browser run created by an explicit attention retry', async () => {
    const replacement = { id: '22222222-2222-4222-8222-222222222222', status: 'queued' };
    const runtime = { retry: vi.fn().mockResolvedValue(replacement) };
    const controller = new BrowserOperationRuntimeController(runtime as never);

    await expect(controller.retry(RUN_ID, 'org-a', { id: 'user-a' } as never))
      .resolves.toBe(replacement);
    expect(runtime.retry).toHaveBeenCalledWith({
      organizationId: 'org-a',
      runId: RUN_ID,
      requestedByUserId: 'user-a',
    });
  });
});
