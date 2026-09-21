import type { DataMigration } from '../types';

/** Run after 016 has resolved legacy SKU references, before dropping columns. */
export const simplifyProductReferencesMigration: DataMigration = {
  id: 'v0.1.31:017_simplify_product_references',
  releaseVersion: '0.1.31',
  name: 'Remove unresolvable matching hints and validate canonical product references',
  phase: 'pre-schema',
  async run(tx) {
    await tx.$queryRaw`
      -- queryraw-tenancy-exempt: serialize this global, writer-stopped cutover.
      SELECT pg_advisory_xact_lock(hashtextextended('kiditem.master-product-inventory-cutover', 0))::text
    `;
    const invalidSuppliers = await tx.$queryRaw<Array<{ count: bigint }>>`
      -- queryraw-tenancy-exempt: validate all organizations before removing legacy references.
      SELECT count(*)::bigint AS count FROM supplier_products supplier
      WHERE NOT EXISTS (
        SELECT 1 FROM master_products product
        WHERE product.id = supplier.master_product_id
          AND product.organization_id = supplier.organization_id
      )
    `;
    if (Number(invalidSuppliers[0]?.count ?? 0) > 0) {
      throw new Error('Supplier product references must resolve within their organization before legacy SKU columns are removed.');
    }
    const deletedAliases = await tx.$executeRaw`
      -- queryraw-tenancy-exempt: Q4 permits deleting stale hints, never confirmed option recipes.
      DELETE FROM sellpia_manual_match_aliases alias
      WHERE NOT EXISTS (
        SELECT 1 FROM master_products product
        WHERE product.id = alias.master_product_id
          AND product.organization_id = alias.organization_id
      )
    `;
    const duplicates = await tx.$queryRaw<Array<{ count: bigint }>>`
      -- queryraw-tenancy-exempt: detect keys that would block the canonical alias unique index.
      SELECT count(*)::bigint AS count FROM (
        SELECT organization_id, normalized_alias, master_product_id, item_count
        FROM sellpia_manual_match_aliases
        GROUP BY organization_id, normalized_alias, master_product_id, item_count
        HAVING count(*) > 1
      ) conflicting_keys
    `;
    if (Number(duplicates[0]?.count ?? 0) > 0) {
      throw new Error('Canonical matching aliases contain duplicate product/quantity keys; resolve them before schema contraction.');
    }
    // The hash remains evidence of the original collection. Only the count of
    // currently usable matching hints changes; confirmed recipes are untouched.
    const updatedSnapshots = await tx.$executeRaw`
      -- queryraw-tenancy-exempt: recompute current hint counts for every affected source snapshot.
      UPDATE sellpia_manual_match_snapshots snapshot
      SET alias_count = (
        SELECT count(*) FROM sellpia_manual_match_aliases alias
        WHERE alias.snapshot_id = snapshot.id
          AND alias.organization_id = snapshot.organization_id
      )
      WHERE alias_count IS DISTINCT FROM (
        SELECT count(*) FROM sellpia_manual_match_aliases alias
        WHERE alias.snapshot_id = snapshot.id
          AND alias.organization_id = snapshot.organization_id
      )
    `;
    return {
      affectedRows: deletedAliases + updatedSnapshots,
      details: { deletedAliases, updatedSnapshots },
    };
  },
};
