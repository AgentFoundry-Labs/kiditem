import { describe, expect, it } from 'vitest';
import {
  normalizeChannelMatchName,
  rankChannelProductCandidates,
  type ChannelProductCandidate,
} from './channel-product-candidate-ranking';

describe('rankChannelProductCandidates', () => {
  it('orders exact identity, code, unique barcode, normalized name, AI, then manual search', () => {
    const candidates = [
      product('existing', 'P-EXISTING', 'Existing'),
      product('code', 'P-CODE', 'Code'),
      product('barcode', 'P-BARCODE', 'Barcode', ['8801234567890']),
      product('name', 'P-NAME', 'Blue Bear'),
      product('ai', 'P-AI', 'AI'),
      product('manual', 'P-MANUAL', 'Manual Bear'),
    ];

    const result = rankChannelProductCandidates({
      candidates,
      confirmedMasterProductId: 'existing',
      providerIdentity: 'provider-1',
      explicitCode: 'P-CODE',
      barcode: '880-1234-567890',
      name: ' blue  bear ',
      aiSuggestion: { masterProductId: 'ai', explanation: 'similar catalog', score: 0.8 },
      manualSearch: 'manual',
    });

    expect(result.map(({ masterProductId, reason, rank }) => ({
      masterProductId,
      reason,
      rank,
    }))).toEqual([
      { masterProductId: 'existing', reason: 'existing_identity', rank: 1 },
      { masterProductId: 'code', reason: 'exact_code', rank: 2 },
      { masterProductId: 'barcode', reason: 'unique_barcode', rank: 3 },
      { masterProductId: 'name', reason: 'exact_normalized_name', rank: 4 },
      { masterProductId: 'ai', reason: 'ai_suggestion', rank: 5 },
      { masterProductId: 'manual', reason: 'manual_search', rank: 6 },
    ]);
  });

  it('does not claim uniqueness when a barcode resolves to multiple products', () => {
    const result = rankChannelProductCandidates({
      candidates: [
        product('one', 'P-1', 'One', ['8801234567890']),
        product('two', 'P-2', 'Two', ['8801234567890']),
      ],
      barcode: '8801234567890',
    });

    expect(result).toEqual([]);
  });

  it('normalizes names as candidate evidence without erasing punctuation', () => {
    expect(normalizeChannelMatchName(' Ｂlue\tBear + Cup ')).toBe('bluebear+cup');
    expect(normalizeChannelMatchName('Blue+Bear')).not.toBe(
      normalizeChannelMatchName('Blue Bear'),
    );
  });
});

function product(
  id: string,
  code: string,
  name: string,
  barcodes: string[] = [],
): ChannelProductCandidate {
  return { id, code, name, category: null, brand: null, barcodes };
}
