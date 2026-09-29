import { Inject, Injectable } from '@nestjs/common';
import type { DashboardCollections } from '@kiditem/shared/dashboard';
import {
  ORDER_COLLECTION_FRESHNESS_PORT,
  type OrderCollectionFreshnessPort,
} from '../../../../orders/application/port/in/order-collection-freshness.port';

/** 원천마다 마지막 수집 완료 시각. Orders 수집 kind의 마지막 성공 실행을 Orders capability에서 그대로 읽는다(KID-359). */
@Injectable()
export class DashboardCollectionsService {
  constructor(
    @Inject(ORDER_COLLECTION_FRESHNESS_PORT)
    private readonly freshness: OrderCollectionFreshnessPort,
  ) {}

  async getCollections(organizationId: string): Promise<DashboardCollections> {
    const lastCompleted = await this.freshness.readLastSucceeded(organizationId);
    return {
      lastCompleted: Object.fromEntries(
        [...lastCompleted].map(([sourceType, at]) => [sourceType, at.toISOString()]),
      ),
    };
  }
}
