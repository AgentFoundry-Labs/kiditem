declare const ownerTransactionBrand: unique symbol;

/** Opaque caller-owned transaction. Only persistence composition can issue it. */
export interface OwnerTransaction {
  readonly [ownerTransactionBrand]: true;
}
