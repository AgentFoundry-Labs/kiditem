import {
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
  | { ok: false; error: string };

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
      error: '매칭할 Sellpia 구성품을 하나 이상 추가해 주세요.',
    };
  }

  if (draft.some((row) => !/^[1-9]\d*$/.test(row.quantityText))) {
    return { ok: false, error: '수량은 1 이상의 정수여야 합니다.' };
  }

  const input = ReplaceChannelSkuComponentsInputSchema.parse({
    components: draft.map((row) => ({
      inventorySkuId: row.inventorySkuId,
      quantity: Number(row.quantityText),
    })),
  });
  return { ok: true, input };
}

export function createUnmapInput(): ReplaceChannelSkuComponentsInput {
  return { components: [] };
}
