import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SourcingCollectionSourceControlRecord,
  SourcingCollectionSourceControlRepositoryPort,
} from '../../../application/port/out/repository/sourcing-collection-source-control.repository.port';

@Injectable()
export class SourcingCollectionSourceControlRepositoryAdapter
  implements SourcingCollectionSourceControlRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async findBySourceKeys(input: {
    organizationId: string;
    sourceKeys: string[];
  }): Promise<SourcingCollectionSourceControlRecord[]> {
    if (input.sourceKeys.length === 0) return [];
    const rows = await this.prisma.sourcingCollectionSourceControl.findMany({
      where: {
        organizationId: input.organizationId,
        sourceKey: { in: Array.from(new Set(input.sourceKeys)) },
      },
      select: { sourceKey: true, enabled: true, updatedAt: true },
    });
    return rows;
  }

  async setEnabled(input: {
    organizationId: string;
    sourceKey: string;
    enabled: boolean;
  }): Promise<SourcingCollectionSourceControlRecord> {
    return this.prisma.sourcingCollectionSourceControl.upsert({
      where: {
        organizationId_sourceKey: {
          organizationId: input.organizationId,
          sourceKey: input.sourceKey,
        },
      },
      create: input,
      update: { enabled: input.enabled },
      select: { sourceKey: true, enabled: true, updatedAt: true },
    });
  }
}
