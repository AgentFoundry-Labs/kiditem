declare const sourcingRepositoryTransactionBrand: unique symbol;

// Opaque handle owned by sourcing repository adapters. Application services can
// pass it across local ports to keep multi-write use cases atomic, but cannot
// call Prisma transaction methods directly.
export type SourcingRepositoryTransaction = {
  readonly [sourcingRepositoryTransactionBrand]?: never;
};
