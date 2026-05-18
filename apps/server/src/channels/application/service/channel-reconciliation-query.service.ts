import { Inject, Injectable } from '@nestjs/common';
import {
  CHANNEL_RECONCILIATION_QUERY_REPOSITORY_PORT,
  type ChannelReconciliationQueryRepositoryPort,
  type ReconciliationRepositoryItemRow,
} from '../port/out/channel-reconciliation.repository.port';

@Injectable()
export class ChannelReconciliationQueryService {
  constructor(
    @Inject(CHANNEL_RECONCILIATION_QUERY_REPOSITORY_PORT)
    private readonly repository: ChannelReconciliationQueryRepositoryPort,
  ) {}

  getSummary(organizationId: string) {
    return this.repository.getSummary(organizationId);
  }

  listItems(
    organizationId: string,
    params: {
      page?: number;
      limit?: number;
      status?: string;
      resolutionSource?: string;
      search?: string;
    },
  ) {
    return this.repository.listItems(organizationId, params);
  }

  hydrateItems(organizationId: string, rows: ReconciliationRepositoryItemRow[]) {
    return this.repository.hydrateItems(organizationId, rows);
  }
}
