import { Inject, Injectable } from '@nestjs/common';
import {
  CHANNEL_RECONCILIATION_RESOLUTION_REPOSITORY_PORT,
  type ChannelReconciliationResolutionRepositoryPort,
} from '../port/out/repository/channel-reconciliation.repository.port';

@Injectable()
export class ChannelReconciliationResolutionService {
  constructor(
    @Inject(CHANNEL_RECONCILIATION_RESOLUTION_REPOSITORY_PORT)
    private readonly repository: ChannelReconciliationResolutionRepositoryPort,
  ) {}

  linkItem(
    itemId: string,
    organizationId: string,
    body: { productOptionId: string },
  ) {
    return this.repository.linkItem(itemId, organizationId, body);
  }

  ignoreItem(
    itemId: string,
    organizationId: string,
    body: { reason?: string | null },
  ) {
    return this.repository.ignoreItem(itemId, organizationId, body);
  }
}
