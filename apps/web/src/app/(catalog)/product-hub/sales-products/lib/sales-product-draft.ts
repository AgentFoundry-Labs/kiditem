import {
  buildSalesProductOptionCombinations,
  salesProductOptionKey,
  type SalesProduct,
  type SalesProductOptionSupplyStatus,
  type SalesProductOptionsReplaceInput,
  type SalesProductUpdateInput,
} from '@kiditem/shared/sales-product';

/**
 * 판매상품 편집 화면의 초안 — 저장 전까지 화면 안에서만 산다. 저장은 바뀐 칸만 보낸다.
 * 옵션표는 줄마다 화면 키(`rowKey`)를 두고, 서버 단품 id 가 있으면 그 단품을 고친다.
 */

export interface OptionComponentDraft {
  sellpiaInventorySkuId: string;
  quantity: number;
  sellpiaCode: string;
  name: string;
  optionName: string | null;
  currentStock: number | null;
}

export interface OptionRowDraft {
  rowKey: string;
  id?: string;
  optionCode?: string;
  values: string[];
  alias: string;
  barcode: string;
  extraPrice: number;
  supplyStatus: SalesProductOptionSupplyStatus;
  safetyStock: number | null;
  components: OptionComponentDraft[];
  linkedChannelOptionCount: number;
}

export interface OptionTableDraft {
  axes: string[];
  rows: OptionRowDraft[];
}

export const BASIC_FIELDS = [
  'name', 'shortName', 'ownCode', 'modelName', 'modelNo', 'brand', 'manufacturer', 'originCountry', 'status',
  'taxType', 'deliveryFeeType', 'deliveryFee', 'costPrice', 'salePrice', 'tagPrice', 'keywords', 'imageUrls',
  'detailHtml', 'noticeCategory', 'noticeValues', 'certifications', 'adminMemo',
] as const;
export type BasicField = (typeof BASIC_FIELDS)[number];
export type BasicsDraft = Pick<SalesProduct, BasicField>;

let rowSeq = 0;
function nextRowKey(): string {
  rowSeq += 1;
  return `row-${rowSeq}`;
}

export function basicsFromProduct(product: SalesProduct): BasicsDraft {
  return Object.fromEntries(BASIC_FIELDS.map((field) => [field, product[field]])) as BasicsDraft;
}

export function optionsFromProduct(product: SalesProduct): OptionTableDraft {
  return {
    axes: [...product.optionAxes],
    rows: product.options.map((option) => ({
      rowKey: nextRowKey(),
      id: option.id,
      optionCode: option.optionCode,
      values: [...option.values],
      alias: option.alias ?? '',
      barcode: option.barcode ?? '',
      extraPrice: option.extraPrice,
      supplyStatus: option.supplyStatus,
      safetyStock: option.safetyStock,
      components: option.components.map((component) => ({ ...component })),
      linkedChannelOptionCount: option.linkedChannelOptionCount,
    })),
  };
}

/** 저장할 기본 칸 — 바뀐 것만. 없으면 null. */
export function basicsPatch(
  product: SalesProduct,
  draft: BasicsDraft,
): Omit<SalesProductUpdateInput, 'expectedVersion'> | null {
  const patch: Record<string, unknown> = {};
  for (const field of BASIC_FIELDS) {
    if (JSON.stringify(product[field]) !== JSON.stringify(draft[field])) patch[field] = draft[field];
  }
  return Object.keys(patch).length > 0 ? (patch as Omit<SalesProductUpdateInput, 'expectedVersion'>) : null;
}

export function optionsChanged(product: SalesProduct, draft: OptionTableDraft): boolean {
  const current = optionsFromProduct(product);
  const shape = (table: OptionTableDraft) => JSON.stringify([
    table.axes,
    table.rows.map((row) => [
      row.id ?? null, row.values, row.alias, row.barcode, row.extraPrice, row.supplyStatus, row.safetyStock,
      row.components.map((component) => [component.sellpiaInventorySkuId, component.quantity]),
    ]),
  ]);
  return shape(current) !== shape(draft);
}

export function optionsPayload(draft: OptionTableDraft, expectedVersion: number): SalesProductOptionsReplaceInput {
  return {
    expectedVersion,
    optionAxes: draft.axes.map((axis) => axis.trim()),
    options: draft.rows.map((row) => ({
      ...(row.id ? { id: row.id } : {}),
      ...(row.optionCode ? { optionCode: row.optionCode } : {}),
      values: row.values.map((value) => value.trim()),
      alias: row.alias.trim() || null,
      barcode: row.barcode.trim() || null,
      extraPrice: row.extraPrice,
      supplyStatus: row.supplyStatus,
      safetyStock: row.safetyStock,
      components: row.components.map((component) => ({
        sellpiaInventorySkuId: component.sellpiaInventorySkuId,
        quantity: component.quantity,
      })),
    })),
  };
}

/**
 * 옵션 단의 값 목록으로 조합을 만들어 **없는 조합만** 더한다. 이미 있는 줄은 그대로 두고, 지우지 않는다 —
 * 몰에 올라간 옵션을 실수로 잃지 않게.
 */
export function addMissingCombinations(draft: OptionTableDraft, axisValues: readonly (readonly string[])[]): OptionTableDraft {
  const combinations = buildSalesProductOptionCombinations(axisValues);
  const existing = new Set(draft.rows.map((row) => salesProductOptionKey(row.values)));
  const added = combinations
    .filter((values) => !existing.has(salesProductOptionKey(values)))
    .map((values) => emptyRow(values));
  return { ...draft, rows: [...draft.rows, ...added] };
}

export function emptyRow(values: string[]): OptionRowDraft {
  return {
    rowKey: nextRowKey(),
    values,
    alias: '',
    barcode: '',
    extraPrice: 0,
    supplyStatus: 'selling',
    safetyStock: null,
    components: [],
    linkedChannelOptionCount: 0,
  };
}

/**
 * 옵션 단을 바꾼다. 단이 없던 단일 상품에 단을 처음 만들면 기존 한 줄은 첫 값을 비워 둔 채 남긴다.
 * 단을 모두 지우면 첫 줄 하나만 남긴다(옵션 없는 상품은 단품 하나).
 */
export function setAxes(draft: OptionTableDraft, axes: string[]): OptionTableDraft {
  if (axes.length === 0) {
    const first = draft.rows[0] ?? emptyRow([]);
    return { axes: [], rows: [{ ...first, values: [] }] };
  }
  return {
    axes,
    rows: draft.rows.map((row) => ({
      ...row,
      values: axes.map((_, index) => row.values[index] ?? ''),
    })),
  };
}

/** 저장 전에 화면이 막을 문제 — 서버 검증과 같은 규칙을 먼저 보여 준다. */
export function optionTableProblems(draft: OptionTableDraft): string[] {
  const problems: string[] = [];
  if (draft.axes.some((axis) => !axis.trim())) problems.push('옵션 이름이 빈 단이 있습니다.');
  if (draft.axes.length === 0 && draft.rows.length !== 1) problems.push('옵션이 없으면 단품은 한 줄입니다.');
  if (draft.rows.length === 0) problems.push('단품이 한 줄은 있어야 합니다.');
  const keys = new Set<string>();
  draft.rows.forEach((row, index) => {
    if (draft.axes.length > 0 && row.values.some((value) => !value.trim())) {
      problems.push(`${index + 1}번째 줄에 빈 옵션 값이 있습니다.`);
    }
    if (row.values.some((value) => /[:|^<>]/.test(value))) {
      problems.push(`${index + 1}번째 줄 옵션 값에 : | ^ < > 는 쓸 수 없습니다.`);
    }
    const key = salesProductOptionKey(row.values);
    if (keys.has(key)) problems.push(`같은 옵션(${key || '단품'})이 두 번 있습니다.`);
    keys.add(key);
  });
  return problems;
}
