import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

const STOPPED_SALE_STATUSES = [
  'paused',
  'suspend',
  'suspended',
  'inactive',
  'deleted',
  'draft',
  'rejected',
  'stopped',
  'discontinued',
  'off_sale',
  'not_on_sale',
  '판매중지',
  '판매 중지',
  '판매중단',
  '판매 중단',
  '판매종료',
  '판매 종료',
  '승인반려',
] as const;

/**
 * MasterProducts that can actually sell now. This predicate is shared by ABC
 * publication and the product-operation selling filter so their populations
 * cannot diverge.
 */
export async function listSellingMasterProductIds(
  prisma: PrismaService | Prisma.TransactionClient,
  organizationId: string,
  candidateIds?: readonly string[],
): Promise<string[]> {
  if (candidateIds && candidateIds.length === 0) return [];
  const candidateFilter = candidateIds
    ? Prisma.sql`AND mp.id IN (${Prisma.join(candidateIds.map((id) => Prisma.sql`${id}::uuid`))})`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT DISTINCT mp.id
    FROM master_products mp
    JOIN sellpia_inventory_skus sku
      ON sku.organization_id = mp.organization_id
     AND sku.master_product_id = mp.id
     AND sku.is_active = TRUE
     AND sku.current_stock > 0
    JOIN channel_listing_option_inventory_components component
      ON component.organization_id = sku.organization_id
     AND component.sellpia_inventory_sku_id = sku.id
    JOIN channel_listing_options clo
      ON clo.organization_id = component.organization_id
     AND clo.id = component.channel_listing_option_id
     AND clo.is_active = TRUE
    JOIN channel_listings cl
      ON cl.organization_id = clo.organization_id
     AND cl.id = clo.listing_id
     AND cl.is_active = TRUE
    JOIN channel_accounts ca
      ON ca.organization_id = cl.organization_id
     AND ca.id = cl.channel_account_id
     AND ca.status = 'active'
    WHERE mp.organization_id = ${organizationId}::uuid
      AND mp.is_active = TRUE
      ${candidateFilter}
      AND TRIM(LOWER(COALESCE(cl.status, '')))
        NOT IN (${Prisma.join(STOPPED_SALE_STATUSES)})
      AND TRIM(LOWER(COALESCE(
          cl.raw_json ->> 'saleStatus',
          cl.raw_json ->> 'salesStatus',
          cl.raw_json ->> 'sale_status',
          cl.raw_json ->> '판매상태',
          ''
        ))) NOT IN (${Prisma.join(STOPPED_SALE_STATUSES)})
      AND TRIM(LOWER(COALESCE(clo.status, '')))
        NOT IN (${Prisma.join(STOPPED_SALE_STATUSES)})
    ORDER BY mp.id ASC
  `);
  return rows.map((row) => row.id);
}
