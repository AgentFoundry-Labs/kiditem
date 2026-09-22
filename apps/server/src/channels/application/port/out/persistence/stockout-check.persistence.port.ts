import type { OwnerTransaction } from '../../../../../common/owner-transaction';
export const STOCKOUT_CHECK_PERSISTENCE_PORT = Symbol('STOCKOUT_CHECK_PERSISTENCE_PORT');
export interface StockoutSubject {
  listingId: string;
  channelAccountId: string;
  externalListingId: string;
  channel: string;
  status: string | null;
  activeExecutions: Array<{ id: string; idempotencyKey: string }>;
  options: Array<{ id: string; externalOptionId: string; status: string | null; registrationType: string | null; capacity: number | null; safetyStock: number; compositionUnconfirmed: boolean }>;
}
export interface StockoutCheckPersistencePort {
  /** Reads confirmed compositions + Products current stock; a missing fact remains null. */
  readSubjects(organizationId: string, listingIds: readonly string[], transaction?: OwnerTransaction): Promise<StockoutSubject[]>;
}
