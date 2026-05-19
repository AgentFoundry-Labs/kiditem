declare const repositoryTransactionBrand: unique symbol;

// Opaque handle owned by repository adapters. Application services can pass it
// between ports, but cannot call Prisma transaction methods directly.
export type RepositoryTransaction = {
  readonly [repositoryTransactionBrand]?: never;
};
