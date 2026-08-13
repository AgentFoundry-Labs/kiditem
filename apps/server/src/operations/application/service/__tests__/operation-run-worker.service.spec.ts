import { describe, expect, it, vi } from 'vitest';
import { OperationRunWorkerService } from '../operation-run-worker.service';

describe('OperationRunWorkerService durable reclaim', () => {
  it('dispatches the exact run returned by lease claim, including an expired running run', async () => {
    const reclaimed = { id: 'run-1', status: 'running', attemptToken: 'token-2' };
    const repository = { claimNextRun: vi.fn().mockResolvedValue(reclaimed) };
    const dispatcher = { dispatch: vi.fn() };
    const worker = new OperationRunWorkerService(
      dispatcher as never,
      repository as never,
      { resumeTerminalChildren: vi.fn() } as never,
    );
    await worker.tick();
    expect(dispatcher.dispatch).toHaveBeenCalledWith(reclaimed);
  });
});
