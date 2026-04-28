import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AgentTasksService } from './agent-tasks.service';

const COMPANY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_COMPANY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TASK_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const BASE_TASK = {
  id: TASK_ID,
  companyId: COMPANY_ID,
  agentType: 'content',
  status: 'running',
  input: {},
  output: null,
  error: null,
  startedAt: new Date('2026-04-16T00:00:00Z'),
  completedAt: null,
  createdAt: new Date('2026-04-16T00:00:00Z'),
  updatedAt: new Date('2026-04-16T00:00:00Z'),
};

function makePrisma() {
  return {
    agentTask: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

function makeAgentRegistry() {
  return {
    runByType: vi.fn().mockResolvedValue({
      ok: true,
      taskId: TASK_ID,
      agentType: 'content',
      dryRun: false,
    }),
  };
}

function makeService() {
  const prisma = makePrisma();
  const agentRegistry = makeAgentRegistry();
  const service = new AgentTasksService(prisma as any, agentRegistry as any);
  return { service, prisma, agentRegistry };
}

describe('AgentTasksService', () => {
  it('create passes companyId to AgentRegistry and re-reads the created task in tenant scope', async () => {
    const { service, prisma, agentRegistry } = makeService();
    const input = { productId: 'product-1' };
    prisma.agentTask.findFirst.mockResolvedValue(BASE_TASK);

    const result = await service.create('content', input, COMPANY_ID);

    expect(agentRegistry.runByType).toHaveBeenCalledWith('content', {
      companyId: COMPANY_ID,
      extra: input,
    });
    expect(prisma.agentTask.findFirst).toHaveBeenCalledWith({
      where: { id: TASK_ID, companyId: COMPANY_ID },
    });
    expect(result).toEqual(BASE_TASK);
  });

  it('findAll scopes tasks to the current company', async () => {
    const { service, prisma } = makeService();
    prisma.agentTask.findMany.mockResolvedValue([BASE_TASK]);

    await service.findAll({ status: 'running', agentType: 'content', limit: 10 }, COMPANY_ID);

    expect(prisma.agentTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: COMPANY_ID,
          status: 'running',
          agentType: 'content',
        },
        take: 10,
      }),
    );
  });

  it('findOne rejects a task id that is not owned by the current company', async () => {
    const { service, prisma } = makeService();
    prisma.agentTask.findUnique.mockResolvedValue({ ...BASE_TASK, companyId: OTHER_COMPANY_ID });
    prisma.agentTask.findFirst.mockResolvedValue(null);

    await expect(service.findOne(TASK_ID, COMPANY_ID)).rejects.toThrow(NotFoundException);
    expect(prisma.agentTask.findFirst).toHaveBeenCalledWith({
      where: { id: TASK_ID, companyId: COMPANY_ID },
      include: { logs: { orderBy: { createdAt: 'asc' } } },
    });
  });

  it('cancel rejects a task id that is not owned by the current company', async () => {
    const { service, prisma } = makeService();
    prisma.agentTask.update.mockResolvedValue({ ...BASE_TASK, companyId: OTHER_COMPANY_ID });
    prisma.agentTask.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.cancel(TASK_ID, COMPANY_ID)).rejects.toThrow(NotFoundException);
    expect(prisma.agentTask.updateMany).toHaveBeenCalledWith({
      where: { id: TASK_ID, companyId: COMPANY_ID },
      data: expect.objectContaining({
        status: 'failed',
        error: 'Cancelled by user',
      }),
    });
    expect(prisma.agentTask.update).not.toHaveBeenCalled();
  });
});
