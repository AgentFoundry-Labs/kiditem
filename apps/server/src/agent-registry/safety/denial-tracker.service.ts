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
    await this.prisma.agentPermissionDenial.create({
      data: {
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
    return this.prisma.agentPermissionDenial.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
    });
  }

  async getSummary(companyId: string) {
    const denials = await this.prisma.agentPermissionDenial.groupBy({
      by: ['category'],
      where: { companyId },
      _count: { id: true },
    });
    const total = denials.reduce((sum, d) => sum + d._count.id, 0);
    return {
      total,
      byCategory: Object.fromEntries(denials.map(d => [d.category, d._count.id])),
    };
  }
}
