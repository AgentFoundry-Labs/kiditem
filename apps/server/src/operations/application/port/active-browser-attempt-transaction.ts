declare const activeBrowserAttemptTransactionBrand: unique symbol;

/**
 * Opaque transaction capability owned by Operations. Other domains may pass
 * it to their repository adapters, but application code cannot issue database
 * calls or depend on the Operations repository implementation.
 */
export type ActiveBrowserAttemptTransaction = {
  readonly [activeBrowserAttemptTransactionBrand]?: never;
};
