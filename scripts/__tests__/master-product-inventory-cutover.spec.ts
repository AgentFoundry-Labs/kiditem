import { describe, expect, it } from 'vitest';
import {
  assertMasterProductInventoryCutoverPlan,
  planMasterProductInventoryMappings,
  sourceIdentityKey,
} from '../data-migrations/helpers/master-product-inventory-cutover';

const ORG = '00000000-0000-0000-0000-000000000001';
const OTHER_ORG = '00000000-0000-0000-0000-000000000002';
const MASTER = '10000000-0000-0000-0000-000000000001';
const OTHER_MASTER = '10000000-0000-0000-0000-000000000002';
const SKU = '20000000-0000-0000-0000-000000000001';

function sku(overrides: Partial<Parameters<typeof planMasterProductInventoryMappings>[0]['skus'][number]> = {}) {
  return {
    id: SKU,
    organizationId: ORG,
    masterProductId: MASTER,
    code: 'P-1-O-1',
    rawJson: { productCode: 'P-1', optionCode: 'O-1' },
    ...overrides,
  };
}

function master(overrides: Partial<Parameters<typeof planMasterProductInventoryMappings>[0]['masterProducts'][number]> = {}) {
  return {
    id: MASTER,
    organizationId: ORG,
    sourceAccountKey: null,
    sourceProductCode: null,
    sourceOptionCode: null,
    ...overrides,
  };
}

function input(overrides: Partial<Parameters<typeof planMasterProductInventoryMappings>[0]> = {}) {
  return {
    skus: [sku()],
    sourceAccounts: [{ organizationId: ORG, sourceAccountKey: 'sellpia:primary' }],
    masterProducts: [master()],
    ...overrides,
  };
}

describe('MasterProduct inventory cutover preflight', () => {
  it('maps an existing SKU without using names or barcodes as identity', () => {
    const plan = planMasterProductInventoryMappings(input());

    expect(plan.issues).toEqual([]);
    expect(plan.mappings).toEqual([expect.objectContaining({
      legacySellpiaInventorySkuId: SKU,
      organizationId: ORG,
      masterProductId: MASTER,
      sourceAccountKey: 'sellpia:primary',
      sourceProductCode: 'P-1',
      sourceOptionCode: 'O-1',
      identityBasis: 'product-option',
    })]);
  });

  it('rejects a legacy composite code when source identity evidence is absent', () => {
    const plan = planMasterProductInventoryMappings(input({
      skus: [sku({ code: 'legacy-code', rawJson: { legacyCode: 'legacy-code' } })],
    }));

    expect(plan.mappings).toEqual([]);
    expect(plan.issues).toEqual([
      expect.objectContaining({
        code: 'invalid_source_identity',
        masterProductId: MASTER,
      }),
    ]);
  });

  it('fails with an actionable issue for every unlinked surviving MasterProduct', () => {
    const unlinkedMasterId = '10000000-0000-0000-0000-000000000003';
    const plan = planMasterProductInventoryMappings(input({
      masterProducts: [master(), master({ id: unlinkedMasterId })],
    }));

    expect(plan.issues).toEqual([
      expect.objectContaining({
        code: 'unlinked_master_product',
        masterProductId: unlinkedMasterId,
        detail: expect.stringContaining('explicit source mapping'),
      }),
    ]);
    expect(() => assertMasterProductInventoryCutoverPlan(plan))
      .toThrow(/counts=\{"unlinked_master_product":1\}/);
  });

  it.each([
    ['missing source account', input({ sourceAccounts: [] }), 'missing_source_account'],
    ['missing explicit master mapping', input({ skus: [sku({ masterProductId: null })] }), 'missing_master_mapping'],
    ['missing master row', input({ masterProducts: [] }), 'master_mapping_not_found'],
    ['cross organization master', input({
      masterProducts: [master({ organizationId: OTHER_ORG })],
    }), 'master_mapping_cross_organization'],
  ])('fails closed for %s', (_label, value, code) => {
    const plan = planMasterProductInventoryMappings(value);
    expect(plan.issues.map((issue) => issue.code)).toContain(code);
    expect(() => assertMasterProductInventoryCutoverPlan(plan)).toThrow(/preflight failed/);
  });

  it('rejects multiple legacy rows for one surviving MasterProduct', () => {
    const plan = planMasterProductInventoryMappings(input({
      skus: [sku(), sku({ id: '20000000-0000-0000-0000-000000000002', code: 'P-2-O-2', rawJson: { productCode: 'P-2', optionCode: 'O-2' } })],
    }));

    expect(plan.issues.map((issue) => issue.code)).toContain('multiple_skus_for_master');
  });

  it('rejects an existing source identity owned by another MasterProduct', () => {
    const plan = planMasterProductInventoryMappings(input({
      masterProducts: [
        master({ sourceAccountKey: 'sellpia:primary', sourceProductCode: 'P-1', sourceOptionCode: 'O-1' }),
        master({ id: OTHER_MASTER, sourceAccountKey: 'sellpia:primary', sourceProductCode: 'P-1', sourceOptionCode: 'O-1' }),
      ],
    }));

    expect(plan.issues.map((issue) => issue.code)).toContain('existing_source_identity_collision');
  });

  it('rejects a legacy identity that conflicts with the surviving row', () => {
    const plan = planMasterProductInventoryMappings(input({
      masterProducts: [master({ sourceAccountKey: 'sellpia:primary', sourceProductCode: 'other', sourceOptionCode: 'O-1' })],
    }));

    expect(plan.issues.map((issue) => issue.code)).toContain('source_identity_conflict');
  });

  it('produces a stable organization-scoped identity key', () => {
    expect(sourceIdentityKey({
      organizationId: ORG,
      sourceAccountKey: 'sellpia:primary',
      sourceProductCode: 'P-1',
      sourceOptionCode: 'O-1',
    })).toBe(`${ORG}\u001fsellpia:primary\u001fP-1\u001fO-1`);
    expect(sourceIdentityKey({
      organizationId: OTHER_ORG,
      sourceAccountKey: 'sellpia:primary',
      sourceProductCode: 'P-1',
      sourceOptionCode: 'O-1',
    })).not.toBe(sourceIdentityKey({
      organizationId: ORG,
      sourceAccountKey: 'sellpia:primary',
      sourceProductCode: 'P-1',
      sourceOptionCode: 'O-1',
    }));
  });
});
