import { describe, expect, it } from 'vitest';
import {
  rankInventorySkuCandidates,
  statusForUnmappedCandidates,
  type CandidateInventorySku,
  type ChannelSkuEvidence,
} from './channel-sku-candidate-ranking';

const baseEvidence: ChannelSkuEvidence = {
  sellerSku: null,
  modelNumber: null,
  barcode: null,
  productNames: [],
  optionName: null,
};

describe('rankInventorySkuCandidates', () => {
  it('prioritizes exact sellerSku before full modelNumber and deduplicates by InventorySku ID', () => {
    const seller = sku('seller', 'ZZ-SELLER');
    const model = sku('model', 'AA-MODEL');
    const results = rank({
      evidence: { ...baseEvidence, sellerSku: 'ZZ-SELLER', modelNumber: 'AA-MODEL' },
      exactCodeCandidates: [model, seller, seller],
      manualSearchCandidates: [seller],
    });

    expect(results.map(({ id, reason }) => ({ id, reason }))).toEqual([
      { id: 'seller', reason: 'exact_sellpia_code' },
      { id: 'model', reason: 'exact_sellpia_code' },
    ]);
  });

  it('accepts only an explicit hyphenated alphanumeric option token as name-field code evidence', () => {
    const exact = sku('exact', '001-ABC');
    const ordinary = sku('ordinary', 'ordinary');
    const results = rank({
      evidence: {
        ...baseEvidence,
        optionName: '색상 ordinary / 코드 001-ABC (2개)',
        productNames: ['ordinary'],
      },
      exactCodeCandidates: [ordinary, exact],
      nameSuggestionCandidates: [ordinary],
    });

    expect(results.map(({ id, reason }) => ({ id, reason }))).toEqual([
      { id: 'exact', reason: 'exact_sellpia_code' },
      { id: 'ordinary', reason: 'name_suggestion' },
    ]);
  });

  it('keeps leading zero Sellpia codes distinct without numeric coercion', () => {
    const results = rank({
      evidence: { ...baseEvidence, sellerSku: '001-ABC' },
      exactCodeCandidates: [sku('wrong', '1-ABC'), sku('right', '001-ABC')],
    });

    expect(results.map(({ id }) => id)).toEqual(['right']);
  });

  it('normalizes only 8-14 digit model/barcode identifiers and ranks them below exact code', () => {
    const exact = sku('exact', 'SP-001');
    const identifier = sku('identifier', 'SP-999', '00-1234-5678');
    const tooShort = sku('short', 'SP-888', '123-4567');
    const results = rank({
      evidence: {
        ...baseEvidence,
        sellerSku: 'SP-001',
        modelNumber: '00 1234 5678',
        barcode: '123-4567',
      },
      exactCodeCandidates: [exact],
      identifierCandidates: [identifier, tooShort],
    });

    expect(results.map(({ id, reason }) => ({ id, reason }))).toEqual([
      { id: 'exact', reason: 'exact_sellpia_code' },
      { id: 'identifier', reason: 'unique_barcode' },
    ]);
    expect(identifier.barcode).toBe('00-1234-5678');
  });

  it('returns every duplicate normalized identifier as ambiguous, never unique', () => {
    const first = sku('b', 'SP-B', '880-1234-5678');
    const second = sku('a', 'SP-A', '88012345678');
    const results = rank({
      evidence: { ...baseEvidence, barcode: '880 1234 5678' },
      identifierCandidates: [first, second],
    });

    expect(results.map(({ id, reason }) => ({ id, reason }))).toEqual([
      { id: 'a', reason: 'ambiguous_identifier' },
      { id: 'b', reason: 'ambiguous_identifier' },
    ]);
    expect(statusForUnmappedCandidates(results)).toBe('needs_review');
  });

  it('uses general names only for suggestions and manual results only for manual search', () => {
    const suggestion = sku('suggestion', 'SP-S');
    const manual = sku('manual', 'SP-M');
    const results = rank({
      evidence: { ...baseEvidence, productNames: ['Blue Bear'], optionName: 'Large' },
      nameSuggestionCandidates: [suggestion],
      manualSearchCandidates: [manual],
    });

    expect(results.map(({ id, reason }) => ({ id, reason }))).toEqual([
      { id: 'suggestion', reason: 'name_suggestion' },
      { id: 'manual', reason: 'manual_search' },
    ]);
    expect(statusForUnmappedCandidates(results)).toBe('unmatched');
  });

  it('preserves a deterministic reason when the same candidate also appears in manual results', () => {
    const deterministic = sku('same', 'SP-SAME', '8801234567890');
    const results = rank({
      evidence: { ...baseEvidence, barcode: '8801234567890' },
      identifierCandidates: [deterministic],
      manualSearchCandidates: [deterministic],
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.reason).toBe('unique_barcode');
  });

  it('orders stably by reason, then Sellpia code, then ID and assigns ordinal ranks', () => {
    const results = rank({
      evidence: { ...baseEvidence, modelNumber: 'SP-EXACT' },
      exactCodeCandidates: [sku('z', 'SP-EXACT')],
      nameSuggestionCandidates: [sku('2', 'SP-B'), sku('9', 'SP-A'), sku('1', 'SP-A')],
      manualSearchCandidates: [sku('m', 'SP-0')],
    });

    expect(results.map(({ id, reason, rank }) => ({ id, reason, rank }))).toEqual([
      { id: 'z', reason: 'exact_sellpia_code', rank: 0 },
      { id: '1', reason: 'name_suggestion', rank: 1 },
      { id: '9', reason: 'name_suggestion', rank: 2 },
      { id: '2', reason: 'name_suggestion', rank: 3 },
      { id: 'm', reason: 'manual_search', rank: 4 },
    ]);
  });

  it('does not accept external product or SKU identifiers as evidence inputs', () => {
    const evidence: ChannelSkuEvidence = {
      ...baseEvidence,
      // @ts-expect-error external IDs are deliberately absent from deterministic evidence
      externalProductId: 'SP-EXTERNAL',
    };
    expect(evidence.productNames).toEqual([]);
  });
});

function rank(input: {
  evidence: ChannelSkuEvidence;
  exactCodeCandidates?: CandidateInventorySku[];
  identifierCandidates?: CandidateInventorySku[];
  nameSuggestionCandidates?: CandidateInventorySku[];
  manualSearchCandidates?: CandidateInventorySku[];
}) {
  return rankInventorySkuCandidates({
    exactCodeCandidates: [],
    identifierCandidates: [],
    nameSuggestionCandidates: [],
    manualSearchCandidates: [],
    ...input,
  });
}

function sku(
  id: string,
  sellpiaProductCode: string,
  barcode: string | null = null,
): CandidateInventorySku {
  return {
    id,
    sellpiaProductCode,
    name: `${sellpiaProductCode} name`,
    optionName: null,
    barcode,
    reportedStock: 3,
  };
}
