import { describe, expect, it } from 'vitest';
import {
  MAX_CHANNEL_SKU_COMPONENT_QUANTITY,
  MAX_CHANNEL_SKU_COMPONENTS,
  type ChannelSkuMappingComponent,
  type ChannelSkuMatchCandidate,
} from '@kiditem/shared/channel-sku-matching';
import {
  addCandidateToDraft,
  createUnmapInput,
  initializeComponentDraft,
  removeDraftComponent,
  serializeComponentDraft,
  updateDraftQuantity,
  type ComponentDraftRow,
} from './component-draft';

const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';

function component(
  overrides: Partial<ChannelSkuMappingComponent> = {},
): ChannelSkuMappingComponent {
  return {
    masterProductId: firstId,
    code: 'SP-001',
    name: '첫 상품',
    optionName: '분홍',
    barcode: '8801234567890',
    currentStock: 8,
    purchasePrice: 1500,
    isActive: true,
    quantity: 4,
    mappingSource: 'manual',
    componentCapacity: 2,
    isBottleneck: true,
    ...overrides,
  };
}

function candidate(
  overrides: Partial<ChannelSkuMatchCandidate> = {},
): ChannelSkuMatchCandidate {
  return {
    masterProductId: secondId,
    code: 'SP-002',
    name: '둘째 상품',
    optionName: null,
    barcode: null,
    currentStock: 3,
    reason: 'manual_search',
    rank: 0,
    ...overrides,
  };
}

describe('channel SKU component draft', () => {
  it('initializes current component rows with exact display data and quantities', () => {
    expect(initializeComponentDraft([component()])).toEqual([
      {
        masterProductId: firstId,
        code: 'SP-001',
        name: '첫 상품',
        optionName: '분홍',
        barcode: '8801234567890',
        currentStock: 8,
        purchasePrice: 1500,
        componentCapacity: 2,
        isBottleneck: true,
        quantityText: '4',
      },
    ]);
  });

  it('adds a candidate locally with quantity 1 without serializing or saving', () => {
    const result = addCandidateToDraft([], candidate());

    expect(result.error).toBeNull();
    expect(result.draft).toEqual([
      expect.objectContaining({ masterProductId: secondId, quantityText: '1' }),
    ]);
  });

  it('returns the unchanged draft and duplicate error for the same MasterProduct', () => {
    const draft = initializeComponentDraft([component()]);

    const result = addCandidateToDraft(
      draft,
      candidate({ masterProductId: firstId }),
    );

    expect(result).toEqual({
      draft,
      error: '이미 추가한 Sellpia 상품입니다.',
    });
    expect(result.draft).toBe(draft);
  });

  it('blocks component 51 with the shared maximum', () => {
    const draft: ComponentDraftRow[] = Array.from(
      { length: MAX_CHANNEL_SKU_COMPONENTS },
      (_, index) => ({
        masterProductId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        code: `SP-${index}`,
        name: `상품 ${index}`,
        optionName: null,
        barcode: null,
        currentStock: index,
        purchasePrice: null,
        componentCapacity: index,
        isBottleneck: false,
        quantityText: '1',
      }),
    );

    const result = addCandidateToDraft(draft, candidate());

    expect(result.draft).toBe(draft);
    expect(result.error).toBe('구성품은 최대 50개까지 추가할 수 있습니다.');
  });

  it('updates only quantity text and leaves display-only inventory data intact', () => {
    const draft = initializeComponentDraft([component()]);

    expect(updateDraftQuantity(draft, firstId, '12')).toEqual([
      { ...draft[0], quantityText: '12' },
    ]);
  });

  it.each(['', '0', '1.5', '-1', 'abc'])(
    'rejects invalid quantity text %j at serialization',
    (quantityText) => {
      const draft = updateDraftQuantity(
        initializeComponentDraft([component()]),
        firstId,
        quantityText,
      );

      expect(serializeComponentDraft(draft)).toEqual({
        ok: false,
        code: 'invalid_quantity',
        error: '수량은 1 이상의 정수여야 합니다.',
      });
    },
  );

  it('serializes quantity 4 with only the Master product ID and quantity', () => {
    const draft = initializeComponentDraft([component()]);

    expect(serializeComponentDraft(draft)).toEqual({
      ok: true,
      input: {
        components: [{ masterProductId: firstId, quantity: 4 }],
      },
    });
  });

  it('preserves mixed X×1 + Y×2 recipe order', () => {
    const first = component({ quantity: 1 });
    const draft = addCandidateToDraft(
      initializeComponentDraft([first]),
      candidate(),
    ).draft;
    const updated = updateDraftQuantity(draft, secondId, '2');

    expect(serializeComponentDraft(updated)).toEqual({
      ok: true,
      input: {
        components: [
          { masterProductId: firstId, quantity: 1 },
          { masterProductId: secondId, quantity: 2 },
        ],
      },
    });
  });

  it('removes exactly the selected row', () => {
    const draft = addCandidateToDraft(
      initializeComponentDraft([component()]),
      candidate(),
    ).draft;

    expect(removeDraftComponent(draft, firstId)).toEqual([
      expect.objectContaining({ masterProductId: secondId }),
    ]);
  });

  it('rejects an empty normal save but exposes a distinct explicit unmap input', () => {
    expect(serializeComponentDraft([])).toEqual({
      ok: false,
      code: 'empty_components',
      error: '매칭할 Sellpia 구성품을 하나 이상 추가해 주세요.',
    });
    expect(createUnmapInput()).toEqual({ components: [] });
  });

  it('accepts the shared database-safe maximum quantity exactly', () => {
    const draft = updateDraftQuantity(
      initializeComponentDraft([component()]),
      firstId,
      String(MAX_CHANNEL_SKU_COMPONENT_QUANTITY),
    );

    expect(serializeComponentDraft(draft)).toEqual({
      ok: true,
      input: {
        components: [
          {
            masterProductId: firstId,
            quantity: MAX_CHANNEL_SKU_COMPONENT_QUANTITY,
          },
        ],
      },
    });
  });

  it.each([
    String(MAX_CHANNEL_SKU_COMPONENT_QUANTITY + 1),
    '9007199254740993',
    '99999999999999999999999999999999999999999999999999',
  ])('rejects over-limit quantity %s before Number conversion', (quantityText) => {
    const draft = updateDraftQuantity(
      initializeComponentDraft([component()]),
      firstId,
      quantityText,
    );

    expect(serializeComponentDraft(draft)).toEqual({
      ok: false,
      code: 'invalid_quantity',
      error: `수량은 1 이상 ${MAX_CHANNEL_SKU_COMPONENT_QUANTITY} 이하의 정수여야 합니다.`,
    });
  });

  it('returns a tagged inline error instead of throwing when shared schema validation fails', () => {
    const draft = initializeComponentDraft([
      component({ masterProductId: 'not-a-uuid' }),
    ]);

    expect(() => serializeComponentDraft(draft)).not.toThrow();
    expect(serializeComponentDraft(draft)).toEqual({
      ok: false,
      code: 'invalid_components',
      error: '구성 정보가 올바르지 않습니다.',
    });
  });
});
