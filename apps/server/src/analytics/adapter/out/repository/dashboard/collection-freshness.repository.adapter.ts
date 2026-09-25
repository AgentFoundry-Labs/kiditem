import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { readLastCompletedSourceImports } from '../../../../../core/read/source-import-run.reader';
import {
  ORDER_COLLECTION_FRESHNESS_PORT,
  type OrderCollectionFreshnessPort,
} from '../../../../../orders/application/port/in/order-collection-freshness.port';
import type { CollectionFreshnessRepositoryPort } from '../../../../application/port/out/repository/dashboard/collection-freshness.repository.port';

/**
 * 원천마다 마지막 수집 완료 시각. 옛 수집은 완료된 `source_import_runs`, 실행 계약으로 옮긴 Orders 수집은 Orders의
 * 마지막 성공 실행(KID-359) — 같은 원천 이름이면 늦은 쪽이다(옮긴 날 앞서 옛 경로로 걷은 것도 있다).
 */
@Injectable()
export class CollectionFreshnessRepositoryAdapter
  implements CollectionFreshnessRepositoryPort
{
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ORDER_COLLECTION_FRESHNESS_PORT) private readonly orderCollections: OrderCollectionFreshnessPort,
  ) {}

  async readLastCompleted(
    organizationId: string,
  ): Promise<ReadonlyMap<string, Date>> {
    const [legacy, operations] = await Promise.all([
      this.prisma.$transaction((tx) => readLastCompletedSourceImports(tx, organizationId)),
      this.orderCollections.readLastSucceeded(organizationId),
    ]);
    const merged = new Map(legacy);
    for (const [sourceType, at] of operations) {
      const previous = merged.get(sourceType);
      if (!previous || at > previous) merged.set(sourceType, at);
    }
    return merged;
  }
}
