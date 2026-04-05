import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentRegistryService } from '../agent-registry/agent-registry.service';

@Injectable()
export class AgentTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRegistry: AgentRegistryService,
  ) {}

  async create(agentType: string, input?: Record<string, unknown>) {
    const result = await this.agentRegistry.runByType(agentType, {
      extra: input,
    });
    const task = await this.prisma.agentTask.findUnique({ where: { id: result.taskId } });
    if (!task) throw new InternalServerErrorException('Failed to retrieve created task');
    return task;
  }

  async findAll(query: { status?: string; agentType?: string; limit?: string }) {
    return this.prisma.agentTask.findMany({
      where: {
        ...(query.status && { status: query.status }),
        ...(query.agentType && { agentType: query.agentType }),
      },
      include: { logs: { orderBy: { createdAt: 'desc' }, take: 5 } },
      orderBy: { createdAt: 'desc' },
      take: parseInt(query.limit || '20'),
    });
  }

  async findOne(id: string) {
    return this.prisma.agentTask.findUnique({
      where: { id },
      include: { logs: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async cancel(id: string) {
    return this.prisma.agentTask.update({
      where: { id },
      data: {
        status: 'failed',
        error: 'Cancelled by user',
        completedAt: new Date(),
      },
    });
  }
}
