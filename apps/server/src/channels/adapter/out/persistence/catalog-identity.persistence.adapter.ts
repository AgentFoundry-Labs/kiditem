import { Injectable, ConflictException } from '@nestjs/common';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { upsertChannelCatalogIdentities } from '../repository/channel-catalog-identity-upsert';
import type { ChannelCatalogIdentityPersistencePort } from '../../../application/port/out/persistence/catalog-identity.persistence.port';
@Injectable()
export class CatalogIdentityPersistenceAdapter implements ChannelCatalogIdentityPersistencePort {
  async publishObservedIdentities(transaction: OwnerTransaction, input: Parameters<ChannelCatalogIdentityPersistencePort['publishObservedIdentities']>[1]) {
    const tx = ownerTransactionClient(transaction);
    const account = await tx.channelAccount.findFirst({ where: { id: input.channelAccountId, organizationId: input.organizationId, status: 'active' }, select: { id: true } });
    if (!account) throw new ConflictException('Active catalog account is required.');
    if (input.lastImportRunId) {
      const source = await tx.sourceImportRun.findFirst({ where: { id: input.lastImportRunId, organizationId: input.organizationId, channelAccountId: input.channelAccountId, sourceType: input.rawSource, status: { in: ['running', 'completed'] } }, select: { id: true } });
      if (!source) throw new ConflictException('Catalog source identity does not match its publication.');
    }
    return upsertChannelCatalogIdentities(tx, input);
  }
}
