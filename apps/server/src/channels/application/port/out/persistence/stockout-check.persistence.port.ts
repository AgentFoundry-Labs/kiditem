import type { OwnerTransaction } from '../../../../../common/owner-transaction';
export const STOCKOUT_CHECK_PERSISTENCE_PORT = Symbol('STOCKOUT_CHECK_PERSISTENCE_PORT');
/** 이 몰 상품을 만든 판매상품. 수집으로만 들어온 몰 상품은 초안이 없어 `null` 이다. */
export interface StockoutSubjectSalesProduct {
  name: string;
  status: string;
  options: Array<{ id: string; supplyStatus: string; salePrice: number | null }>;
}

export interface StockoutSubject {
  listingId: string;
  channelAccountId: string;
  externalListingId: string;
  channel: string;
  status: string | null;
  salesProduct: StockoutSubjectSalesProduct | null;
  activeExecutions: Array<{ id: string; idempotencyKey: string }>;
  options: Array<{ id: string; externalOptionId: string; status: string | null; registrationType: string | null; capacity: number | null; safetyStock: number; compositionUnconfirmed: boolean }>;
}
export interface StockoutCheckPersistencePort {
  /** Reads confirmed compositions + Products current stock; a missing fact remains null. */
  readSubjects(organizationId: string, listingIds: readonly string[], transaction?: OwnerTransaction): Promise<StockoutSubject[]>;
}
