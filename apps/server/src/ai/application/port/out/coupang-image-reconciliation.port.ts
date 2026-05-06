import type { CoupangInventoryRow } from './coupang-inventory-scrape.port';

export const COUPANG_IMAGE_RECONCILIATION_PORT = Symbol(
  'COUPANG_IMAGE_RECONCILIATION_PORT',
);

export interface RecordCoupangImageRowsInput {
  organizationId: string;
  rows: CoupangInventoryRow[];
}

export interface CoupangImageReconciliationPort {
  recordRows(input: RecordCoupangImageRowsInput): Promise<void>;
}
