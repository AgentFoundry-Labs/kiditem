import type { OwnerTransaction } from '../../../../../common/owner-transaction';

/** Issued by the transaction owner; adapters alone may unwrap the client. */
export type ChannelsRepositoryTransaction = OwnerTransaction;
