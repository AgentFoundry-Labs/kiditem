declare const channelsRepositoryTransactionBrand: unique symbol;

// Opaque handle owned by channels repository adapters. The registration
// execution fence passes it across cross-domain ports so a draft transition and
// its execution row commit together, without letting callers reach Prisma
// transaction methods.
export type ChannelsRepositoryTransaction = {
  readonly [channelsRepositoryTransactionBrand]?: never;
};
