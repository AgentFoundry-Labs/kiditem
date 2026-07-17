import { describe, expect, it } from 'vitest';
import {
  rankChannelVariantCandidates,
  type ChannelVariantCandidate,
} from './channel-variant-candidate-ranking';

describe('rankChannelVariantCandidates', () => {
  it('uses only variants belonging to the confirmed listing product', () => {
    const result = rankChannelVariantCandidates({
      confirmedMasterProductId: 'product-1',
      candidates: [
        variant('same', 'product-1', 'VAR-SAME', 'Large'),
        variant('foreign', 'product-2', 'VAR-FOREIGN', 'Large'),
      ],
      name: 'large',
    });

    expect(result.map((candidate) => candidate.productVariantId)).toEqual(['same']);
  });

  it('orders confirmed identity, explicit code, unique barcode, name, AI, and manual evidence', () => {
    const candidates = [
      variant('existing', 'product', 'EXISTING', 'Existing'),
      variant('code', 'product', 'SELLER-SKU', 'Code'),
      variant('barcode', 'product', 'BAR', 'Barcode', ['8801234567890']),
      variant('name', 'product', 'NAME', 'Large'),
      variant('ai', 'product', 'AI', 'AI'),
      variant('manual', 'product', 'MANUAL', 'Manual Large'),
    ];
    const result = rankChannelVariantCandidates({
      confirmedMasterProductId: 'product',
      confirmedProductVariantId: 'existing',
      providerIdentity: 'option-1',
      explicitCode: 'SELLER-SKU',
      barcode: '8801234567890',
      name: 'large',
      aiSuggestion: { productVariantId: 'ai', explanation: 'same option', score: 0.7 },
      manualSearch: 'manual',
      candidates,
    });

    expect(result.map(({ productVariantId, reason }) => ({ productVariantId, reason })))
      .toEqual([
        { productVariantId: 'existing', reason: 'existing_identity' },
        { productVariantId: 'code', reason: 'exact_code' },
        { productVariantId: 'barcode', reason: 'unique_barcode' },
        { productVariantId: 'name', reason: 'exact_normalized_name' },
        { productVariantId: 'ai', reason: 'ai_suggestion' },
        { productVariantId: 'manual', reason: 'manual_search' },
      ]);
  });
});

function variant(
  id: string,
  masterProductId: string,
  code: string,
  optionLabel: string,
  barcodes: string[] = [],
): ChannelVariantCandidate {
  return {
    id,
    masterProductId,
    code,
    name: optionLabel,
    optionLabel,
    barcodes,
  };
}
