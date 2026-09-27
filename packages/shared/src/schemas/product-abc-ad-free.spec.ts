import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { productAbcDisplayStatus } from '../product-abc';
import {
  PRODUCT_ABC_ABSOLUTE_AD_FREE_AD_SOURCE_POLICY_HASH,
  PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD,
  PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD_HASH,
  PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD_JSON,
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  ProductAbcDisplayStatusSchema,
  ProductAbcEvaluationProvenanceSchema,
  ProductAbcFormulaPayloadSchema,
  ProductAbcGradeHistorySchema,
  ProductAbcSourceFreshnessSchema,
  productAbcExcludesAdvertising,
} from './product-abc';

/**
 * Formula version 3 grades without advertising (owner decision 2026-09-18):
 * no advertising generation had ever been collected, so no grade could be
 * published at all. It is its own version so a grade always says which rule
 * made it.
 */
describe('advertising-free ABC formula (version 3)', () => {
  it('hashes its advertising policy the same canonical way as version 2', () => {
    const hash = createHash('sha256')
      .update(JSON.stringify({
        historicalAdvertisingPolicy: 'EXCLUDED_V1',
        allocationPolicy: 'LISTING_DAY_LARGEST_REMAINDER_V1',
      }))
      .digest('hex');
    expect(PRODUCT_ABC_ABSOLUTE_AD_FREE_AD_SOURCE_POLICY_HASH).toBe(hash);
  });

  it('checksums its payload the way formula versions are keyed', () => {
    expect(createHash('sha256').update(PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD_JSON).digest('hex'))
      .toBe(PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD_HASH);
  });

  it('parses, and is recognised as excluding advertising', () => {
    expect(ProductAbcFormulaPayloadSchema.safeParse(PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD).success).toBe(true);
    expect(productAbcExcludesAdvertising(PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD)).toBe(true);
    expect(productAbcExcludesAdvertising(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD)).toBe(false);
  });

  it.each([
    ['version 3 that still counts advertising', { ...PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD, historicalAdvertisingPolicy: 'COUPANG_AD_EVIDENCE_V1' }],
    ['version 2 that drops advertising', { ...PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD, historicalAdvertisingPolicy: 'EXCLUDED_V1' }],
    ['a policy hash that does not match its policy', { ...PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD, adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.adSourcePolicyHash }],
  ])('rejects %s', (_label, payload) => {
    expect(ProductAbcFormulaPayloadSchema.safeParse(payload).success).toBe(false);
  });

  // ABC has no advertising source any more (KID-373, 사용자 2026-09-25 "3,4는 제거하자"):
  // a grade waits on the mapping and Sellpia alone.
  it('derives the display word from mapping and Sellpia alone', () => {
    const facts = (sellpiaReady: boolean) => ({
      evaluation: null,
      sources: { mapping: { valid: true }, sellpia: { ready: sellpiaReady } },
    });
    expect(productAbcDisplayStatus(facts(true))).toBe('INSUFFICIENT_EVIDENCE');
    expect(productAbcDisplayStatus(facts(false))).toBe('SELLPIA_SOURCE_STALE');
    expect(ProductAbcDisplayStatusSchema.options).not.toContain('AD_SOURCE_STALE');
  });

  it('keeps no advertising provenance or spend on an evaluation or its source freshness', () => {
    const evaluationKeys = Object.keys(ProductAbcEvaluationProvenanceSchema.shape);
    expect(evaluationKeys).not.toContain('advertisingSourceImportRunId');
    expect(evaluationKeys).not.toContain('advertisingGeneration');
    expect(Object.keys(ProductAbcSourceFreshnessSchema.shape)).toEqual([
      'evaluationCutoffDate',
      'sellpia',
      'mapping',
    ]);
    expect(Object.keys(ProductAbcGradeHistorySchema.innerType().shape))
      .not.toContain('nextAdvertisingSourceImportRunId');
  });
});
