import { describe, it, expect, vi } from 'vitest';
import { DenialTrackerService } from '../denial-tracker.service';

function makePrisma() {
  return {
    agentEvent: {
      create: vi.fn().mockResolvedValue({ id: 'event-1' }),
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    },
  } as any;
}

describe('DenialTrackerService', () => {
  it('records a denial', async () => {
    const prisma = makePrisma();
    const service = new DenialTrackerService(prisma);

    await service.recordDenial({
      companyId: 'co-1',
      agentId: 'agent-1',
      runId: 'run-1',
      category: 'dangerous_tool',
      detail: 'Bash(rm:*)',
    });

    expect(prisma.agentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'permission_denied',
        category: 'dangerous_tool',
        detail: 'Bash(rm:*)',
        action: 'blocked',
      }),
    });
  });

  it('lists denials with default limit', async () => {
    const prisma = makePrisma();
    const service = new DenialTrackerService(prisma);

    await service.listDenials('agent-1', 'co-1');

    expect(prisma.agentEvent.findMany).toHaveBeenCalledWith({
      where: { agentId: 'agent-1', companyId: 'co-1', eventType: 'permission_denied' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  });

  it('lists denials with custom limit', async () => {
    const prisma = makePrisma();
    const service = new DenialTrackerService(prisma);

    await service.listDenials('agent-1', 'co-1', { limit: 10 });

    expect(prisma.agentEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });
});
