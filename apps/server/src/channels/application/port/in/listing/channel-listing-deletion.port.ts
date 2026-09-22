import type {
  ChannelListingDeletionOperationLookup,
  ChannelListingDeletionUnresolvedInput,
} from '../../out/repository/channel-listing.repository.port';

export const CHANNEL_LISTING_DELETION_PORT = Symbol(
  'CHANNEL_LISTING_DELETION_PORT',
);

export interface ChannelListingDeletionPort {
  authorize(_input: {
    organizationId: string;
    userId: string;
    listingId: string;
    password: string;
    idempotencyKey: string;
  }): never;
  claimExecution(_input: ChannelListingDeletionOperationLookup): never;
  markUnresolved(
    input: ChannelListingDeletionUnresolvedInput,
  ): Promise<
    import('../../out/repository/channel-listing.repository.port').ChannelListingDeletionUnresolvedResult
  >;
  getStatus(
    input: ChannelListingDeletionOperationLookup,
  ): Promise<
    | import('../../out/repository/channel-listing.repository.port').ChannelListingDeletionOperationStatus
    | null
  >;
  reconcileObservedDeletion(
    input: ChannelListingDeletionOperationLookup,
  ): Promise<{
    operationId: string;
    status: 'succeeded';
    providerOutcome: 'succeeded';
  }>;
}
