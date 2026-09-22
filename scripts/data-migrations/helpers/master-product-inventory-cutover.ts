/**
 * Pure preflight for the MasterProduct inventory cutover.
 *
 * The database migration deliberately does not infer a missing MasterProduct
 * from names, barcodes, or legacy `code` values. A legacy row must already
 * point at the MasterProduct that survives the cutover, and its raw payload
 * must contain the source product identity. The old composite `code` is kept
 * only as historical data until the legacy table is dropped; it is never used
 * to invent an external source code.
 */

export type LegacySellpiaSkuRow = {
  id: string;
  organizationId: string;
  masterProductId: string | null;
  code: string;
  rawJson: unknown;
};

export type SourceAccountRow = {
  organizationId: string;
  sourceAccountKey: string | null;
};

export type ExistingMasterProductRow = {
  id: string;
  organizationId: string;
  sourceAccountKey: string | null;
  sourceProductCode: string | null;
  sourceOptionCode: string | null;
};

export type MasterProductInventoryMapping = {
  legacySellpiaInventorySkuId: string;
  organizationId: string;
  masterProductId: string;
  sourceAccountKey: string;
  sourceProductCode: string;
  sourceOptionCode: string;
  identityBasis: 'product-option' | 'product-only';
};

export type InventoryCutoverIssue = {
  code:
    | 'missing_source_account'
    | 'missing_master_mapping'
    | 'master_mapping_not_found'
    | 'master_mapping_cross_organization'
    | 'multiple_skus_for_master'
    | 'duplicate_source_identity'
    | 'existing_source_identity_collision'
    | 'invalid_source_identity'
    | 'source_identity_conflict'
    | 'unlinked_master_product';
  organizationId: string;
  legacySellpiaInventorySkuId?: string;
  masterProductId?: string;
  detail: string;
};

export type InventoryCutoverPlan = {
  mappings: MasterProductInventoryMapping[];
  issues: InventoryCutoverIssue[];
};

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function sourceParts(row: LegacySellpiaSkuRow): Pick<
  MasterProductInventoryMapping,
  'sourceProductCode' | 'sourceOptionCode' | 'identityBasis'
> | null {
  const raw = row.rawJson && typeof row.rawJson === 'object'
    ? row.rawJson as Record<string, unknown>
    : {};
  const productCode = stringValue(
    raw.sourceProductCode ?? raw.productCode ?? raw['상품코드'],
  );
  const optionCode = stringValue(
    raw.sourceOptionCode ?? raw.optionCode ?? raw['옵션코드'],
  );
  if (!productCode) return null;
  return {
    sourceProductCode: productCode,
    // A source row without an option has an explicit product identity and an
    // empty option component. This is absence of an option, not a value
    // synthesized from the legacy SKU code.
    sourceOptionCode: optionCode ?? '',
    identityBasis: optionCode ? 'product-option' : 'product-only',
  };
}

export function sourceIdentityKey(input: {
  organizationId: string;
  sourceAccountKey: string;
  sourceProductCode: string;
  sourceOptionCode: string;
}): string {
  return [
    input.organizationId,
    input.sourceAccountKey,
    input.sourceProductCode,
    input.sourceOptionCode,
  ].join('\u001f');
}

export function planMasterProductInventoryMappings(input: {
  skus: readonly LegacySellpiaSkuRow[];
  sourceAccounts: readonly SourceAccountRow[];
  masterProducts: readonly ExistingMasterProductRow[];
}): InventoryCutoverPlan {
  const issues: InventoryCutoverIssue[] = [];
  const accountsByOrganization = new Map(
    input.sourceAccounts.map((row) => [row.organizationId, row.sourceAccountKey]),
  );
  const mastersByOrganizationAndId = new Map(
    input.masterProducts.map((row) => [`${row.organizationId}\u001f${row.id}`, row]),
  );
  const mastersById = new Map<string, ExistingMasterProductRow[]>();
  for (const master of input.masterProducts) {
    const rows = mastersById.get(master.id) ?? [];
    rows.push(master);
    mastersById.set(master.id, rows);
  }

  const mappings: MasterProductInventoryMapping[] = [];
  const masterIdsByOrganization = new Map<string, string>();
  const identityToMaster = new Map<string, string>();
  const legacyIdentityToMaster = new Map<string, string>();
  const linkedMasterKeys = new Set<string>();

  // Existing source identities are authoritative as well. A legacy row may
  // not silently take an identity already owned by another surviving product.
  // The migration reports this before writing any row, even when the
  // conflicting MasterProduct is not itself represented by a legacy SKU.
  for (const master of input.masterProducts) {
    if (
      master.sourceAccountKey === null
      || master.sourceProductCode === null
      || master.sourceOptionCode === null
    ) continue;
    const identity = sourceIdentityKey({
      organizationId: master.organizationId,
      sourceAccountKey: master.sourceAccountKey,
      sourceProductCode: master.sourceProductCode,
      sourceOptionCode: master.sourceOptionCode,
    });
    const previousMaster = identityToMaster.get(identity);
    if (previousMaster && previousMaster !== master.id) {
      issues.push({
        code: 'existing_source_identity_collision',
        organizationId: master.organizationId,
        masterProductId: master.id,
        detail: `Source identity is already owned by MasterProduct ${previousMaster}.`,
      });
      continue;
    }
    identityToMaster.set(identity, master.id);
  }

  for (const sku of input.skus) {
    const sourceAccountKey = stringValue(accountsByOrganization.get(sku.organizationId));
    if (!sourceAccountKey) {
      issues.push({
        code: 'missing_source_account',
        organizationId: sku.organizationId,
        legacySellpiaInventorySkuId: sku.id,
        detail: 'Sellpia source account key is missing for the organization.',
      });
      continue;
    }
    if (!sku.masterProductId) {
      issues.push({
        code: 'missing_master_mapping',
        organizationId: sku.organizationId,
        legacySellpiaInventorySkuId: sku.id,
        detail: 'Legacy SKU has no existing MasterProduct mapping; no product is inferred.',
      });
      continue;
    }

    const master = mastersByOrganizationAndId.get(
      `${sku.organizationId}\u001f${sku.masterProductId}`,
    );
    if (!master) {
      const foreign = mastersById.get(sku.masterProductId) ?? [];
      issues.push({
        code: foreign.length > 0
          ? 'master_mapping_cross_organization'
          : 'master_mapping_not_found',
        organizationId: sku.organizationId,
        legacySellpiaInventorySkuId: sku.id,
        masterProductId: sku.masterProductId,
        detail: foreign.length > 0
          ? 'Legacy SKU points at a MasterProduct owned by another organization.'
          : 'Legacy SKU points at a MasterProduct that does not exist.',
      });
      continue;
    }

    // The explicit legacy FK is the only allowed live mapping. Mark the
    // MasterProduct as linked before validating source evidence so an invalid
    // identity is reported as such rather than hidden inside the unlinked
    // product report.
    linkedMasterKeys.add(`${sku.organizationId}\u001f${master.id}`);

    const previousSku = masterIdsByOrganization.get(
      `${sku.organizationId}\u001f${sku.masterProductId}`,
    );
    if (previousSku) {
      issues.push({
        code: 'multiple_skus_for_master',
        organizationId: sku.organizationId,
        legacySellpiaInventorySkuId: sku.id,
        masterProductId: sku.masterProductId,
        detail: `MasterProduct is already mapped from legacy SKU ${previousSku}; refusing to merge rows.`,
      });
    } else {
      masterIdsByOrganization.set(
        `${sku.organizationId}\u001f${sku.masterProductId}`,
        sku.id,
      );
    }

    const parts = sourceParts(sku);
    if (!parts) {
      issues.push({
        code: 'invalid_source_identity',
        organizationId: sku.organizationId,
        legacySellpiaInventorySkuId: sku.id,
        masterProductId: master.id,
        detail: 'Legacy SKU rawJson has no explicit non-empty source product code; legacy code is not used as an external identity.',
      });
      continue;
    }
    const identity = sourceIdentityKey({
      organizationId: sku.organizationId,
      sourceAccountKey,
      sourceProductCode: parts.sourceProductCode,
      sourceOptionCode: parts.sourceOptionCode,
    });
    const previousIdentityMaster = identityToMaster.get(identity);
    if (previousIdentityMaster && previousIdentityMaster !== master.id) {
      issues.push({
        code: 'existing_source_identity_collision',
        organizationId: sku.organizationId,
        legacySellpiaInventorySkuId: sku.id,
        masterProductId: master.id,
        detail: `Source identity is already assigned to MasterProduct ${previousIdentityMaster}.`,
      });
    }
    const previousLegacyIdentityMaster = legacyIdentityToMaster.get(identity);
    if (previousLegacyIdentityMaster && previousLegacyIdentityMaster !== master.id) {
      issues.push({
        code: 'duplicate_source_identity',
        organizationId: sku.organizationId,
        legacySellpiaInventorySkuId: sku.id,
        masterProductId: master.id,
        detail: `Source identity is already mapped from a different legacy SKU to MasterProduct ${previousLegacyIdentityMaster}.`,
      });
    }
    legacyIdentityToMaster.set(identity, master.id);

    const fields = [
      ['sourceAccountKey', master.sourceAccountKey, sourceAccountKey],
      ['sourceProductCode', master.sourceProductCode, parts.sourceProductCode],
      ['sourceOptionCode', master.sourceOptionCode, parts.sourceOptionCode],
    ] as const;
    for (const [field, existing, expected] of fields) {
      if (existing !== null && existing !== expected) {
        issues.push({
          code: 'source_identity_conflict',
          organizationId: sku.organizationId,
          legacySellpiaInventorySkuId: sku.id,
          masterProductId: master.id,
          detail: `${field} is ${JSON.stringify(existing)} but legacy SKU resolves to ${JSON.stringify(expected)}.`,
        });
      }
    }

    mappings.push({
      legacySellpiaInventorySkuId: sku.id,
      organizationId: sku.organizationId,
      masterProductId: master.id,
      sourceAccountKey,
      ...parts,
    });
  }

  for (const master of input.masterProducts) {
    if (linkedMasterKeys.has(`${master.organizationId}\u001f${master.id}`)) continue;
    issues.push({
      code: 'unlinked_master_product',
      organizationId: master.organizationId,
      masterProductId: master.id,
      detail: 'MasterProduct has no legacy Sellpia SKU mapping; provide an explicit source mapping or decide its disposition before cutover.',
    });
  }

  return { mappings, issues };
}

export function assertMasterProductInventoryCutoverPlan(
  plan: InventoryCutoverPlan,
): asserts plan is InventoryCutoverPlan & { issues: [] } {
  if (plan.issues.length === 0) return;
  const issueCounts = plan.issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.code] = (counts[issue.code] ?? 0) + 1;
    return counts;
  }, {});
  throw new Error(
    `MasterProduct inventory cutover preflight failed (${plan.issues.length} issue(s), counts=${JSON.stringify(issueCounts)}): `
      + JSON.stringify(plan.issues),
  );
}
