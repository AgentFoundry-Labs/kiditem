import { Inject, Injectable } from '@nestjs/common';
import type { DashboardCollections } from '@kiditem/shared/dashboard';
import {
  COLLECTION_FRESHNESS_REPOSITORY_PORT,
  type CollectionFreshnessRepositoryPort,
} from '../../port/out/repository/dashboard/collection-freshness.repository.port';

@Injectable()
export class DashboardCollectionsService {
  constructor(
    @Inject(COLLECTION_FRESHNESS_REPOSITORY_PORT)
    private readonly freshness: CollectionFreshnessRepositoryPort,
  ) {}

  async getCollections(organizationId: string): Promise<DashboardCollections> {
    const lastCompleted = await this.freshness.readLastCompleted(organizationId);
    return {
      lastCompleted: Object.fromEntries(
        [...lastCompleted].map(([sourceType, at]) => [sourceType, at.toISOString()]),
      ),
    };
  }
}
