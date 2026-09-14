import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { readLastCompletedSourceImports } from '../../../../../core/read/source-import-run.reader';
import type { CollectionFreshnessRepositoryPort } from '../../../application/port/out/repository/collection-freshness.repository.port';

@Injectable()
export class CollectionFreshnessRepositoryAdapter
  implements CollectionFreshnessRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async readLastCompleted(
    organizationId: string,
  ): Promise<ReadonlyMap<string, Date>> {
    return this.prisma.$transaction((tx) =>
      readLastCompletedSourceImports(tx, organizationId),
    );
  }
}
