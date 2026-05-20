import { Inject, Injectable } from '@nestjs/common';
import {
  CHANNEL_RECONCILIATION_MATCHER_PORT,
  type ChannelReconciliationMatcherPort,
  type Tx,
} from '../port/out/repository/channel-reconciliation.repository.port';

@Injectable()
export class ChannelReconciliationMatcherService {
  constructor(
    @Inject(CHANNEL_RECONCILIATION_MATCHER_PORT)
    private readonly matcher: ChannelReconciliationMatcherPort,
  ) {}

  evaluateRow(
    tx: Tx,
    organizationId: string,
    externalId: string,
    externalOptionId: string | null,
    legacyCode: string | null,
  ) {
    return this.matcher.evaluateRow(
      tx,
      organizationId,
      externalId,
      externalOptionId,
      legacyCode,
    );
  }
}
