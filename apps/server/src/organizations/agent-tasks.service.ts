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

  async create(agentType: string, input: Record<string, unknown> | undefined, organizationId: string) {
    const result = await this.agentRegistry.runByType(agentType, {
      organizationId,
      extra: input,
    });
    const task = await this.prisma.agentTask.findFirst({
      where: { id: result.taskId, organizationId },
    });
    if (!task) throw new InternalServerErrorException('Failed to retrieve created task');
    return task;
  }

  async findAll(query: ListAgentTasksQueryDto, organizationId: string) {
    return this.prisma.agentTask.findMany({
      where: {
        organizationId,
        ...(query.status && { status: query.status }),
        ...(query.agentType && { agentType: query.agentType }),
      },
      include: { logs: { orderBy: { createdAt: 'desc' }, take: 5 } },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 20,
    });
  }

  async findOne(id: string, organizationId: string) {
    const task = await this.prisma.agentTask.findFirst({
      where: { id, organizationId },
      include: { logs: { orderBy: { createdAt: 'asc' } } },
    });
    if (!task) throw new NotFoundException('Agent task not found');
    return task;
  }

  async cancel(id: string, organizationId: string): Promise<{ ok: true }> {
    const result = await this.prisma.agentTask.updateMany({
      where: { id, organizationId },
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
