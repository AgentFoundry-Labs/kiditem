import { describe, expect, it, vi } from 'vitest';
import { ThumbnailAutoService } from '../application/service/thumbnail-auto.service';

const COMPANY_ID = 'company-1';

describe('ThumbnailAutoService', () => {
  it('wraps auto generation scheduling in a HeartbeatRun visible to the agent tab', async () => {
    const batchResult = {
      attempted: 1,
      succeeded: 1,
      failed: 0,
      skipped: 0,
      runs: [{ ok: true, productId: 'product-1', generationId: 'generation-1' }],
    };
    const prisma = {
      agentDefinition: {
        findUnique: vi.fn(async () => ({ id: 'agent-1' })),
        create: vi.fn(),
      },
      heartbeatRun: {
        create: vi.fn(async () => ({ id: 'run-1' })),
        update: vi.fn(async () => ({})),
      },
    };
    const generationService = {
      createAutoBatch: vi.fn(async () => batchResult),
    };
    const eventEmitter = { emit: vi.fn() };
    const service = new ThumbnailAutoService(
      prisma as never,
      generationService as never,
      eventEmitter as never,
    );

    const result = await service.runBatch(COMPANY_ID, 5);

    expect(result).toEqual({ ...batchResult, runId: 'run-1' });
    expect(prisma.heartbeatRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        agentId: 'agent-1',
        companyId: COMPANY_ID,
        status: 'running',
      }),
      select: { id: true },
    });
    expect(generationService.createAutoBatch).toHaveBeenCalledWith(COMPANY_ID, 5);
    expect(prisma.heartbeatRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({
        status: 'succeeded',
        resultJson: batchResult,
      }),
    });
    expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
  });
});
