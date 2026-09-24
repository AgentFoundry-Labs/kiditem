import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type {
  ChannelCatalogIdentityUpsertInput,
  ChannelCatalogIdentityUpsertResult,
} from '../../../../domain/collection/catalog-identities';
export const CHANNEL_CATALOG_IDENTITY_PORT = Symbol(
  'CHANNEL_CATALOG_IDENTITY_PORT',
);
export interface ChannelCatalogIdentityPort {
  publishObservedIdentities(
    transaction: OwnerTransaction,
    input: ChannelCatalogIdentityUpsertInput,
  ): Promise<ChannelCatalogIdentityUpsertResult>;
}
