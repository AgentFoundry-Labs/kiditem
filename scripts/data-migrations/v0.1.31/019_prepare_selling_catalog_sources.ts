import { Prisma } from '@prisma/client';
import type { DataMigration } from '../types';
import { assertKidItemCodeSequenceDefinition } from '../ensure/kid-item-code-sequence';

type LegacyRow = { row: Record<string, unknown> };

/** Runs before immutable 016 removes legacy SKU rows; registration identities are unchanged. */
export const prepareSellingCatalogSourcesMigration: DataMigration = {
  id: 'v0.1.31:019_prepare_selling_catalog_sources',
  releaseVersion: '0.1.31',
  name: 'Preserve selling templates before the source inventory cutover',
  phase: 'pre-schema',
  async run(tx) {
    const [shape] = await tx.$queryRaw<Array<{ catalog: boolean; legacy: boolean }>>`
      SELECT to_regclass('public.sales_products') IS NOT NULL AS catalog,
        to_regclass('public.sellpia_inventory_skus') IS NOT NULL AS legacy
    `;
    if (!shape?.catalog) return { affectedRows: 0, details: { outcome: 'catalog_not_created' } };
    await mapSourceComponents(tx);
    await alignAllocator(tx);
    if (shape.legacy) {
      const constraints = await tx.$queryRaw<Array<{ name: string }>>`
        -- queryraw-tenancy-exempt: inspect the one known legacy template foreign key in the writer-stopped cutover.
        SELECT constraint_row.conname AS name FROM pg_constraint constraint_row
        WHERE constraint_row.contype = 'f'
          AND constraint_row.conrelid = 'public.sales_product_option_components'::regclass
          AND constraint_row.confrelid = 'public.sellpia_inventory_skus'::regclass
      `;
      for (const constraint of constraints) {
        const quotedName = '"' + constraint.name.replaceAll('"', '""') + '"';
        // Identifier comes only from the exact relation pair above; values cannot enter SQL.
        await tx.$executeRaw(Prisma.sql`ALTER TABLE sales_product_option_components DROP CONSTRAINT ${Prisma.raw(quotedName)}`);
      }
    }
    return { affectedRows: 0, details: { outcome: 'source_references_prepared', externalIdentifiersChanged: false } };
  },
};

export async function mapSourceComponents(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`ALTER TABLE sales_product_option_components ADD COLUMN IF NOT EXISTS master_product_id uuid`;
  const rows = await tx.$queryRaw<LegacyRow[]>`
    -- queryraw-tenancy-exempt: preserve legacy template references across organizations in the writer-stopped cutover.
    SELECT to_jsonb(component) AS row FROM sales_product_option_components component ORDER BY organization_id, id
  `;
  const [shape] = await tx.$queryRaw<Array<{ legacy: boolean }>>`SELECT to_regclass('public.sellpia_inventory_skus') IS NOT NULL AS legacy`;
  for (const { row } of rows) {
    const organizationId = requiredText(row.organization_id), componentId = requiredText(row.id);
    const quantity = integer(row.quantity, 'component quantity');
    if (quantity <= 0) throw new Error('Non-positive source component quantity blocks cutover.');
    if (row.master_product_id == null) {
      if (!shape?.legacy || row.sellpia_inventory_sku_id == null) throw new Error('A source component has no resolvable legacy identity.');
      const skuId = requiredText(row.sellpia_inventory_sku_id);
      const [source] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT master.id FROM sellpia_inventory_skus sku
        JOIN master_products master ON master.id = sku.master_product_id AND master.organization_id = sku.organization_id
        WHERE sku.id = ${skuId}::uuid AND sku.organization_id = ${organizationId}::uuid
      `;
      if (!source) throw new Error('Legacy selling component cannot be mapped to its original source product.');
      await tx.$executeRaw`UPDATE sales_product_option_components SET master_product_id = ${source.id}::uuid
        WHERE id = ${componentId}::uuid AND organization_id = ${organizationId}::uuid`;
    }
  }
  const [invalid] = await tx.$queryRaw<Array<{ foreignOrganization: boolean; duplicate: boolean }>>`
    -- queryraw-tenancy-exempt: validate all existing template references before schema contraction.
    SELECT EXISTS (
      SELECT 1 FROM sales_product_option_components component
      JOIN master_products master ON master.id = component.master_product_id
      WHERE master.organization_id <> component.organization_id
    ) AS "foreignOrganization", EXISTS (
      SELECT 1 FROM sales_product_option_components
      GROUP BY organization_id, sales_product_option_id, master_product_id HAVING count(*) > 1
    ) AS duplicate
  `;
  if (invalid?.foreignOrganization || invalid?.duplicate) {
    throw new Error('Conflicting source component identity blocks selling catalog cutover.');
  }
}

export async function alignAllocator(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw`
    -- queryraw-tenancy-exempt: global identifier allocator lock during writer-stopped cutover.
    SELECT pg_advisory_xact_lock(hashtextextended('kiditem.kid-item-code-sequence', 0))::text
  `;
  await tx.$executeRaw`CREATE SEQUENCE IF NOT EXISTS kid_item_code_seq AS integer MINVALUE 1 MAXVALUE 99999999 START WITH 1 INCREMENT BY 1 NO CYCLE`;
  await assertKidItemCodeSequenceDefinition(tx);
  const [max] = await tx.$queryRaw<Array<{ suffix: bigint | null }>>`
    -- queryraw-tenancy-exempt: the identifier namespace is intentionally global across organizations and owners.
    SELECT max(substring(code FROM 4)::bigint) AS suffix FROM (
      SELECT code FROM master_products WHERE code ~ '^KID[0-9]{8}$'
      UNION ALL SELECT kid_item_code FROM channel_listing_options WHERE kid_item_code ~ '^KID[0-9]{8}$'
      UNION ALL SELECT code FROM sales_products WHERE code ~ '^KID[0-9]{8}$'
      UNION ALL SELECT option_code FROM sales_product_options WHERE option_code ~ '^KID[0-9]{8}$'
    ) issued
  `;
  const [state] = await tx.$queryRaw<Array<{ last_value: bigint; is_called: boolean }>>`SELECT last_value, is_called FROM kid_item_code_seq`;
  if (max?.suffix && (max.suffix > state.last_value || (!state.is_called && max.suffix === state.last_value))) {
    await tx.$executeRaw`SELECT setval('kid_item_code_seq'::regclass, ${max.suffix}, true)`;
  }
}

function requiredText(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Missing selling catalog identity blocks cutover.');
  return value;
}
function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(`Invalid ${label} blocks selling catalog cutover.`);
  return value;
}
