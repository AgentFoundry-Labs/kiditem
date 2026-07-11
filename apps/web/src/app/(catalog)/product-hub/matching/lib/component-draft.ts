import {
  MAX_CHANNEL_SKU_COMPONENT_QUANTITY,
  MAX_CHANNEL_SKU_COMPONENTS,
  ReplaceChannelSkuComponentsInputSchema,
  type ChannelSkuMappingComponent,
  type ChannelSkuMatchCandidate,
  type ReplaceChannelSkuComponentsInput,
} from '@kiditem/shared/channel-sku-matching';

export type ComponentDraftRow = {
  inventorySkuId: string;
  sellpiaProductCode: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  reportedStock: number;
  quantityText: string;
};

export type ComponentDraftResult = {
  draft: ComponentDraftRow[];
  error: string | null;
};

export type ComponentDraftSerialization =
  | { ok: true; input: ReplaceChannelSkuComponentsInput }
  | {
      ok: false;
      code: 'empty_components' | 'invalid_quantity' | 'invalid_components';
      error: string;
    };

export function initializeComponentDraft(
  components: ChannelSkuMappingComponent[],
): ComponentDraftRow[] {
  return components.map((component) => ({
    inventorySkuId: component.inventorySkuId,
    sellpiaProductCode: component.sellpiaProductCode,
    name: component.name,
    optionName: component.optionName,
    barcode: component.barcode,
    reportedStock: component.reportedStock,
    quantityText: String(component.quantity),
  }));
}

export function addCandidateToDraft(
  draft: ComponentDraftRow[],
  candidate: ChannelSkuMatchCandidate,
): ComponentDraftResult {
  if (draft.some((row) => row.inventorySkuId === candidate.inventorySkuId)) {
    return { draft, error: '이미 추가한 Sellpia 상품입니다.' };
  }
  if (draft.length >= MAX_CHANNEL_SKU_COMPONENTS) {
    return {
      draft,
      error: `구성품은 최대 ${MAX_CHANNEL_SKU_COMPONENTS}개까지 추가할 수 있습니다.`,
    };
  }

  return {
    draft: [
      ...draft,
      {
        inventorySkuId: candidate.inventorySkuId,
        sellpiaProductCode: candidate.sellpiaProductCode,
        name: candidate.name,
        optionName: candidate.optionName,
        barcode: candidate.barcode,
        reportedStock: candidate.reportedStock,
        quantityText: '1',
      },
    ],
    error: null,
  };
}

export function updateDraftQuantity(
  draft: ComponentDraftRow[],
  inventorySkuId: string,
  quantityText: string,
): ComponentDraftRow[] {
  return draft.map((row) =>
    row.inventorySkuId === inventorySkuId ? { ...row, quantityText } : row,
  );
}

export function removeDraftComponent(
  draft: ComponentDraftRow[],
  inventorySkuId: string,
): ComponentDraftRow[] {
  return draft.filter((row) => row.inventorySkuId !== inventorySkuId);
}

export function serializeComponentDraft(
  draft: ComponentDraftRow[],
): ComponentDraftSerialization {
  if (draft.length === 0) {
    return {
      ok: false,
      code: 'empty_components',
      error: '매칭할 Sellpia 구성품을 하나 이상 추가해 주세요.',
    };
  }

  if (draft.some((row) => !/^[1-9]\d*$/.test(row.quantityText))) {
    return {
      ok: false,
      code: 'invalid_quantity',
      error: '수량은 1 이상의 정수여야 합니다.',
    };
  }

  const maxQuantity = BigInt(MAX_CHANNEL_SKU_COMPONENT_QUANTITY);
  const quantities = draft.map((row) => BigInt(row.quantityText));
  if (quantities.some((quantity) => quantity > maxQuantity)) {
    return {
      ok: false,
      code: 'invalid_quantity',
      error: `수량은 1 이상 ${MAX_CHANNEL_SKU_COMPONENT_QUANTITY} 이하의 정수여야 합니다.`,
    };
  }

  const parsed = ReplaceChannelSkuComponentsInputSchema.safeParse({
    components: draft.map((row, index) => ({
      inventorySkuId: row.inventorySkuId,
      quantity: Number(quantities[index]),
    })),
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid_components',
      error: '구성 정보가 올바르지 않습니다.',
    };
  }
  return { ok: true, input: parsed.data };
}

export function createUnmapInput(): ReplaceChannelSkuComponentsInput {
  return { components: [] };
}
