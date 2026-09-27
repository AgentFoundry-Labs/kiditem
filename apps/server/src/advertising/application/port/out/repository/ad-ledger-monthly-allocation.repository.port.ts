import type { OwnerTransaction } from '../../../../../common/owner-transaction';

export const AD_LEDGER_MONTHLY_ALLOCATION_PORT = Symbol('AdLedgerMonthlyAllocationPort');

/** 한 리스팅의 한 달(`YYYY-MM`) 합 — 넘겨받은 측정일의 상품 사실 행만 더한다. */
export type AdListingMonthSpend = Readonly<{
  channelAccountId: string;
  listingId: string;
  month: string;
  spend: number;
  billedSpend: number;
}>;

/**
 * 기여이익 월 배분(KID-372 ①b)이 읽는 리스팅×달 합. 측정일은 application 서비스가 coverage로 정해 넘기고, 원천상품 배분
 * (현재 확정 레시피 무게)은 서비스가 한다 — 이 포트는 원장 합만 읽는다. 구현은
 * `adapter/out/persistence/ad-ledger-monthly-allocation.persistence.adapter.ts`.
 */
export interface AdLedgerMonthlyAllocationPort {
  readListingMonthSpends(
    transaction: OwnerTransaction,
    input: Readonly<{ organizationId: string; activeAccountIds: readonly string[]; dates: readonly string[] }>,
  ): Promise<AdListingMonthSpend[]>;
}
