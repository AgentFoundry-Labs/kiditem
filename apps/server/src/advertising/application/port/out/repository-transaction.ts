// Opaque transaction handle for advertising repository adapters.
//
// Application services depend on this `RepositoryTransaction` type instead of
// `Prisma.TransactionClient` so the Prisma surface never leaks across the
// port boundary. Repository adapters that own `$transaction` lifecycles
// internally use this branded handle when callers must compose multiple
// writes inside a single transaction; today the only such cases live
// entirely inside their adapter (`createAdActionsFromCandidates`,
// `approveAdActions`, etc., wrap `$transaction` themselves) so the handle
// stays unused in application code. Kept here to match the inventory port
// vocabulary and ready for future multi-port transactional composition.
declare const RepositoryTransactionBrand: unique symbol;
export type RepositoryTransaction = {
  readonly [RepositoryTransactionBrand]: true;
};
