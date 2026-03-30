import { describe, it, expect, vi } from 'vitest';
import { WakeupService } from '../wakeup.service';

function makePrisma() {
  return {
    agentWakeupRequest: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

function makeService() {
  const prisma = makePrisma();
  return { service: new WakeupService(prisma as any), prisma };
}

describe('WakeupService', () => {
  describe('requestWakeup', () => {
    it('creates new wakeup request when none queued', async () => {
      const { service, prisma } = makeService();
      prisma.agentWakeupRequest.findFirst.mockResolvedValue(null);
      prisma.agentWakeupRequest.create.mockResolvedValue({ id: 'w-1' });

      const result = await service.requestWakeup({
        agentId: 'agent-1',
        companyId: 'c-1',
        source: 'on_demand',
        reason: 'Test',
      });

      expect(result.id).toBe('w-1');
      expect(prisma.agentWakeupRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          agentId: 'agent-1',
          source: 'on_demand',
          status: 'queued',
        }),
      });
    });

    it('coalesces when existing queued request', async () => {
      const { service, prisma } = makeService();
      prisma.agentWakeupRequest.findFirst.mockResolvedValue({
        id: 'w-existing',
        coalescedCount: 2,
        reason: 'Old',
        payload: null,
      });
      prisma.agentWakeupRequest.update.mockResolvedValue({});

      const result = await service.requestWakeup({
        agentId: 'agent-1',
        companyId: 'c-1',
        source: 'timer',
        reason: 'New reason',
      });

      expect(result.id).toBe('w-existing');
      expect(prisma.agentWakeupRequest.create).not.toHaveBeenCalled();
      expect(prisma.agentWakeupRequest.update).toHaveBeenCalledWith({
        where: { id: 'w-existing' },
        data: expect.objectContaining({
          coalescedCount: { increment: 1 },
          reason: 'New reason',
        }),
      });
    });
  });

  describe('claimNext', () => {
    it('claims oldest queued request', async () => {
      const { service, prisma } = makeService();
      prisma.agentWakeupRequest.findFirst.mockResolvedValue({ id: 'w-1', source: 'on_demand' });
      prisma.agentWakeupRequest.update.mockResolvedValue({});

      const result = await service.claimNext('agent-1');

      expect(result?.id).toBe('w-1');
      expect(prisma.agentWakeupRequest.update).toHaveBeenCalledWith({
        where: { id: 'w-1' },
        data: expect.objectContaining({ status: 'claimed' }),
      });
    });

    it('returns null when no queued requests', async () => {
      const { service, prisma } = makeService();
      prisma.agentWakeupRequest.findFirst.mockResolvedValue(null);

      const result = await service.claimNext('agent-1');

      expect(result).toBeNull();
    });
  });

  describe('finish', () => {
    it('marks request as finished', async () => {
      const { service, prisma } = makeService();
      prisma.agentWakeupRequest.update.mockResolvedValue({});

      await service.finish('w-1', 'run-1');

      expect(prisma.agentWakeupRequest.update).toHaveBeenCalledWith({
        where: { id: 'w-1' },
        data: expect.objectContaining({ status: 'finished', runId: 'run-1' }),
      });
    });

    it('marks request as failed with error', async () => {
      const { service, prisma } = makeService();
      prisma.agentWakeupRequest.update.mockResolvedValue({});

      await service.finish('w-1', 'run-1', 'timeout error');

      expect(prisma.agentWakeupRequest.update).toHaveBeenCalledWith({
        where: { id: 'w-1' },
        data: expect.objectContaining({ status: 'failed', error: 'timeout error' }),
      });
    });
  });
});
