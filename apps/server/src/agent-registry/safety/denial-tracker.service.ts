import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DenialTrackerService {
  constructor(private readonly prisma: PrismaService) {}

  async recordDenial(input: {
    companyId: string;
    agentId: string;
    runId?: string;
    category: string;
    detail: string;
    action?: string;
  }): Promise<void> {
    await this.prisma.agentEvent.create({
      data: {
        eventType: 'permission_denied',
        company: { connect: { id: input.companyId } },
        agent: { connect: { id: input.agentId } },
        runId: input.runId,
        category: input.category,
        detail: input.detail,
        action: input.action ?? 'blocked',
      },
    });
  }

  async listDenials(agentId: string, options?: { limit?: number }) {
    return this.prisma.agentEvent.findMany({
      where: { agentId, eventType: 'permission_denied' },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
    });
  }

  async getSummary(companyId: string) {
    const denials = await this.prisma.agentEvent.groupBy({
      by: ['category'],
      where: { companyId, eventType: 'permission_denied' },
      _count: { id: true },
    });
    const total = denials.reduce((sum, d) => sum + d._count.id, 0);
    return {
      total,
      byCategory: Object.fromEntries(denials.map(d => [d.category, d._count.id])),
    };
  }
}
