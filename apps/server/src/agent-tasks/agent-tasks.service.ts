import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AgentTasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(agentType: string, input?: Record<string, unknown>) {
    const task = await this.prisma.agentTask.create({
      data: {
        agentType,
        ...(input && { input: input as any }),
      },
    });

    await this.prisma.$executeRawUnsafe(
      `SELECT pg_notify('new_agent_task', $1)`,
      task.id,
    );

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
}
