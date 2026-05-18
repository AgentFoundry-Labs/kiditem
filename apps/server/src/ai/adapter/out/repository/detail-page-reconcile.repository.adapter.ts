import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  DetailPageReconcileRepositoryPort,
  DetailPageTerminalRequest,
} from '../../../application/port/out/detail-page-reconcile.repository.port';

@Injectable()
export class DetailPageReconcileRepositoryAdapter implements DetailPageReconcileRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  listTerminalRequests(input: {
    organizationId: string;
    since: Date;
    limit: number;
  }): Promise<DetailPageTerminalRequest[]> {
    return this.prisma.agentRunRequest.findMany({
      where: {
        organizationId: input.organizationId,
        sourceResourceType: 'content_generation',
        source: 'ai.detail_page_generate',
        status: { in: ['succeeded', 'failed'] },
        finishedAt: { gte: input.since },
      },
      orderBy: { finishedAt: 'desc' },
      take: input.limit,
    });
  }

  findContentGenerationStatus(input: {
    organizationId: string;
    contentGenerationId: string;
  }): Promise<{ id: string; status: string } | null> {
    return this.prisma.contentGeneration.findFirst({
      where: {
        id: input.contentGenerationId,
        organizationId: input.organizationId,
      },
      select: { id: true, status: true },
    });
  }
}
