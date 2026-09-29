import { Inject, Injectable } from '@nestjs/common';
import {
  ORDER_COLLECTION_FRESHNESS_PORT,
  type OrderCollectionFreshnessPort,
} from '../../../../../orders/application/port/in/order-collection-freshness.port';
import type { CollectionFreshnessRepositoryPort } from '../../../../application/port/out/repository/dashboard/collection-freshness.repository.port';

/**
 * 원천마다 마지막 수집 완료 시각: Orders 수집 kind의 마지막 성공 실행(KID-359), 웹이 읽는 옛 원천 이름으로. 옛
 * `source_import_runs` 완료 행은 읽지 않는다(KID-365, ADR-0010).
 */
@Injectable()
export class CollectionFreshnessRepositoryAdapter
  implements CollectionFreshnessRepositoryPort
{
  constructor(
    @Inject(ORDER_COLLECTION_FRESHNESS_PORT) private readonly orderCollections: OrderCollectionFreshnessPort,
  ) {}

  readLastCompleted(organizationId: string): Promise<ReadonlyMap<string, Date>> {
    return this.orderCollections.readLastSucceeded(organizationId);
  }
}
