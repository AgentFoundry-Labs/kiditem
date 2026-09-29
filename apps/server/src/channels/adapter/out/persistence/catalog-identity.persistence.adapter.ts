import { USABLE_CHANNEL_ACCOUNT_STATUSES } from '../../../domain/account/channel-account-usability';
import { Injectable, ConflictException } from '@nestjs/common';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { upsertChannelCatalogIdentities } from '../repository/channel-catalog-identity-upsert';
import type { ChannelCatalogIdentityPersistencePort } from '../../../application/port/out/persistence/catalog-identity.persistence.port';
@Injectable()
export class CatalogIdentityPersistenceAdapter implements ChannelCatalogIdentityPersistencePort {
  async publishObservedIdentities(transaction: OwnerTransaction, input: Parameters<ChannelCatalogIdentityPersistencePort['publishObservedIdentities']>[1]) {
    const tx = ownerTransactionClient(transaction);
    const account = await tx.channelAccount.findFirst({ where: { id: input.channelAccountId, organizationId: input.organizationId, status: { in: [...USABLE_CHANNEL_ACCOUNT_STATUSES] } }, select: { id: true } });
    if (!account) throw new ConflictException('Active catalog account is required.');
    return upsertChannelCatalogIdentities(tx, input);
  }
}
