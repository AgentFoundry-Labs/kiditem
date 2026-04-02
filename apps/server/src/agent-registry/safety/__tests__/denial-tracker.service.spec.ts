import { describe, it, expect, vi } from 'vitest';
import { DenialTrackerService } from '../denial-tracker.service';

function makePrisma() {
  return {
    agentPermissionDenial: {
      create: vi.fn().mockResolvedValue({ id: 'denial-1' }),
      findMany: vi.fn().mockResolvedValue([]),
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

    expect(prisma.agentPermissionDenial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        category: 'dangerous_tool',
        detail: 'Bash(rm:*)',
        action: 'blocked',
      }),
    });
  });

  it('lists denials with default limit', async () => {
    const prisma = makePrisma();
    const service = new DenialTrackerService(prisma);

    await service.listDenials('agent-1');

    expect(prisma.agentPermissionDenial.findMany).toHaveBeenCalledWith({
      where: { agentId: 'agent-1' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  });

  it('lists denials with custom limit', async () => {
    const prisma = makePrisma();
    const service = new DenialTrackerService(prisma);

    await service.listDenials('agent-1', { limit: 10 });

    expect(prisma.agentPermissionDenial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });
});
