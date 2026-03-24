import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AgentTasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(agentType: string, input?: Record<string, unknown>) {
    return this.prisma.agentTask.create({
      data: {
        agentType,
        ...(input && { input: input as any }),
      },
    });
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
