import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import type { CollectionFreshnessRepositoryPort } from '../../../application/port/out/repository/collection-freshness.repository.port';

@Injectable()
export class CollectionFreshnessRepositoryAdapter
  implements CollectionFreshnessRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async readLastCompleted(
    organizationId: string,
  ): Promise<ReadonlyMap<string, Date>> {
    const rows = await this.prisma.sourceImportRun.groupBy({
      by: ['sourceType'],
      where: { organizationId, status: 'completed', importedAt: { not: null } },
      _max: { importedAt: true },
    });
    return new Map(
      rows
        .filter((row): row is typeof row & { _max: { importedAt: Date } } =>
          row._max.importedAt !== null)
        .map((row) => [row.sourceType, row._max.importedAt]),
    );
  }
}
