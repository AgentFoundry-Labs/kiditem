import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import type {
  AdLedgerMonthlyAllocationPort,
  AdListingMonthSpend,
} from '../../../application/port/out/repository/ad-ledger-monthly-allocation.repository.port';

type Row = {
  channel_account_id: string;
  listing_id: string;
  month: string;
  spend: bigint | number;
  billed_spend: bigint | number;
};

/**
 * 리스팅×달 광고비 합(KID-372 ①b). 조직·활성 계정·측정일로만 질의하고 organization_id를 묶는다. 리스팅에 맞춰지지 않은
 * 행(`listing_id` null)은 원천상품에 나눌 수 없어 읽지 않는다.
 */
@Injectable()
export class AdLedgerMonthlyAllocationPersistenceAdapter implements AdLedgerMonthlyAllocationPort {
  async readListingMonthSpends(
    transaction: OwnerTransaction,
    input: Readonly<{ organizationId: string; activeAccountIds: readonly string[]; dates: readonly string[] }>,
  ): Promise<AdListingMonthSpend[]> {
    if (input.activeAccountIds.length === 0 || input.dates.length === 0) return [];
    const rows = await ownerTransactionClient(transaction).$queryRaw<Row[]>(Prisma.sql`
      SELECT p.channel_account_id, p.listing_id,
        to_char(p.date, 'YYYY-MM') AS month,
        COALESCE(SUM(p.spend), 0)::bigint AS spend,
        COALESCE(SUM(p.billed_spend), 0)::bigint AS billed_spend
      FROM channel_ad_product_daily_snapshots p
      WHERE p.organization_id = ${input.organizationId}::uuid
        AND p.channel_account_id = ANY(${[...input.activeAccountIds]}::uuid[])
        AND p.date = ANY(${[...input.dates]}::date[])
        AND p.listing_id IS NOT NULL
      GROUP BY p.channel_account_id, p.listing_id, to_char(p.date, 'YYYY-MM')
      ORDER BY p.listing_id, month
    `);
    return rows.map((row) => ({
      channelAccountId: row.channel_account_id,
      listingId: row.listing_id,
      month: row.month,
      spend: Number(row.spend),
      billedSpend: Number(row.billed_spend),
    }));
  }
}
