import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentRegistryService } from '../agent-registry/agent-registry.service';
import type { ListAgentTasksQueryDto } from './dto';

@Injectable()
export class AgentTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRegistry: AgentRegistryService,
  ) {}

  async create(agentType: string, input: Record<string, unknown> | undefined, companyId: string) {
    const result = await this.agentRegistry.runByType(agentType, {
      companyId,
      extra: input,
    });
    const task = await this.prisma.agentTask.findFirst({
      where: { id: result.taskId, companyId },
    });
    if (!task) throw new InternalServerErrorException('Failed to retrieve created task');
    return task;
  }

  async findAll(query: ListAgentTasksQueryDto, companyId: string) {
    return this.prisma.agentTask.findMany({
      where: {
        companyId,
        ...(query.status && { status: query.status }),
        ...(query.agentType && { agentType: query.agentType }),
      },
      include: { logs: { orderBy: { createdAt: 'desc' }, take: 5 } },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 20,
    });
  }

  async findOne(id: string, companyId: string) {
    const task = await this.prisma.agentTask.findFirst({
      where: { id, companyId },
      include: { logs: { orderBy: { createdAt: 'asc' } } },
    });
    if (!task) throw new NotFoundException('Agent task not found');
    return task;
  }

  async cancel(id: string, companyId: string): Promise<{ ok: true }> {
    const result = await this.prisma.agentTask.updateMany({
      where: { id, companyId },
      data: {
        status: 'failed',
        error: 'Cancelled by user',
        completedAt: new Date(),
      },
    });
    if (result.count === 0) throw new NotFoundException('Agent task not found');
    return { ok: true };
  }
}
