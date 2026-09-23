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
  masterProductId: string;
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
  salePrice: number;
  normalPrice: number | null;
  supplyStatus: SalesProductOptionSupplyStatus;
  safetyStock: number | null;
  components: OptionComponentDraft[];
  linkedChannelOptionCount: number;
}

export interface OptionTableDraft {
  axes: string[];
  /** Local editor base; option rows keep the final prices the API stores. */
  baseSalePrice: number;
  rows: OptionRowDraft[];
}

export const BASIC_FIELDS = [
  'name', 'shortName', 'ownCode', 'modelName', 'modelNo', 'brand', 'manufacturer', 'originCountry',
  'taxType', 'deliveryFeeType', 'deliveryFee', 'keywords', 'imageUrls',
  'noticeCategory', 'noticeValues', 'certifications', 'adminMemo',
  // KID-310: 수집·직접 작성 초안이 채우는 칸(전에는 후보에만 있었다).
  'description', 'targetAudience', 'ageGroup', 'productSize', 'colorVariantNames', 'boxSetQuantity',
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
  const activeOptions = product.options.filter((option) => option.supplyStatus !== 'unused');
  // 판매가를 아직 정하지 않은 초안 옵션(null)은 0으로 편집을 시작한다 — 입력칸의 빈 값과 같은 뜻이다.
  const baseSalePrice = activeOptions.length > 0
    ? Math.min(...activeOptions.map((option) => option.salePrice ?? 0))
    : 0;
  return {
    axes: [...product.optionAxes],
    baseSalePrice,
    rows: product.options.map((option) => ({
      rowKey: nextRowKey(),
      id: option.id,
      optionCode: option.optionCode ?? undefined,
      values: [...option.values],
      alias: option.alias ?? '',
      barcode: option.barcode ?? '',
      salePrice: option.salePrice ?? 0,
      normalPrice: option.normalPrice,
      supplyStatus: option.supplyStatus,
      safetyStock: option.safetyStock,
      components: option.components.map((component) => ({ ...component })),
      linkedChannelOptionCount: option.linkedChannelOptionCount,
    })),
  };
}

/** Apply a common base edit to active rows as a delta, keeping archived prices intact. */
export function setBaseSalePrice(draft: OptionTableDraft, nextBase: number): OptionTableDraft {
  const base = Math.max(0, Math.round(nextBase));
  const delta = base - draft.baseSalePrice;
  return {
    ...draft,
    baseSalePrice: base,
    rows: draft.rows.map((row) => row.supplyStatus === 'unused'
      ? row
      : { ...row, salePrice: Math.max(0, row.salePrice + delta) }),
  };
}

/** Set one row's final price from the local base plus the displayed option extra. */
export function setOptionExtraPrice(
  draft: OptionTableDraft,
  rowKey: string,
  extraPrice: number,
): OptionTableDraft {
  const salePrice = Math.max(0, Math.round(draft.baseSalePrice + extraPrice));
  return {
    ...draft,
    rows: draft.rows.map((row) => (row.rowKey === rowKey ? { ...row, salePrice } : row)),
  };
}

export function optionExtraPrice(row: OptionRowDraft, draft: OptionTableDraft): number {
  return row.salePrice - draft.baseSalePrice;
}

export function commonNormalPrice(draft: OptionTableDraft): { value: number | null; mixed: boolean } {
  const activeRows = draft.rows.filter((row) => row.supplyStatus !== 'unused');
  if (activeRows.length === 0) return { value: null, mixed: false };
  const first = activeRows[0]!.normalPrice;
  const mixed = activeRows.some((row) => row.normalPrice !== first);
  return { value: mixed ? null : first, mixed };
}

/** An explicit common TAG edit applies to active options only. */
export function setCommonNormalPrice(draft: OptionTableDraft, normalPrice: number | null): OptionTableDraft {
  return {
    ...draft,
    rows: draft.rows.map((row) => row.supplyStatus === 'unused' ? row : { ...row, normalPrice }),
  };
}

/**
 * 저장할 기본 칸 — 바뀐 것만. 없으면 null. 상태는 편집 칸이 아니다(KID-313): 판매 상품(`active`)을
 * 보관하라는 요청(`archive`)만 `status: 'archived'` 로 보낸다. 초안은 보관하지 않고 지운다.
 */
export function basicsPatch(
  product: SalesProduct,
  draft: BasicsDraft,
  request: { archive?: boolean } = {},
): Omit<SalesProductUpdateInput, 'expectedVersion'> | null {
  const patch: Omit<SalesProductUpdateInput, 'expectedVersion'> = {};
  for (const field of BASIC_FIELDS) {
    if (JSON.stringify(product[field]) !== JSON.stringify(draft[field])) copyBasic(patch, draft, field);
  }
  if (request.archive && product.status === 'active') patch.status = 'archived';
  return Object.keys(patch).length > 0 ? patch : null;
}

function copyBasic<K extends BasicField>(
  patch: Pick<Omit<SalesProductUpdateInput, 'expectedVersion'>, K>,
  draft: BasicsDraft,
  field: K,
): void {
  patch[field] = draft[field];
}

export function optionsChanged(product: SalesProduct, draft: OptionTableDraft): boolean {
  const current = optionsFromProduct(product);
  const shape = (table: OptionTableDraft) => JSON.stringify([
    table.axes,
    table.rows.map((row) => [
      row.id ?? null, row.values, row.alias, row.barcode, row.salePrice, row.normalPrice,
      row.supplyStatus, row.safetyStock,
      row.components.map((component) => [component.masterProductId, component.quantity]),
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
      salePrice: row.salePrice,
      normalPrice: row.normalPrice,
      supplyStatus: row.supplyStatus,
      safetyStock: row.safetyStock,
      components: row.components.map((component) => ({
        masterProductId: component.masterProductId,
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
  const firstActive = draft.rows.find((row) => row.supplyStatus !== 'unused');
  const defaults = {
    salePrice: draft.baseSalePrice,
    normalPrice: firstActive?.normalPrice ?? null,
  };
  const added = combinations
    .filter((values) => !existing.has(salesProductOptionKey(values)))
    .map((values) => emptyRow(values, defaults));
  return { ...draft, rows: [...draft.rows, ...added] };
}

export function emptyRow(
  values: string[],
  defaults: { salePrice?: number; normalPrice?: number | null } = {},
): OptionRowDraft {
  return {
    rowKey: nextRowKey(),
    values,
    alias: '',
    barcode: '',
    salePrice: defaults.salePrice ?? 0,
    normalPrice: defaults.normalPrice ?? null,
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
    const first = draft.rows[0] ?? emptyRow([], { salePrice: draft.baseSalePrice });
    return { ...draft, axes: [], rows: [{ ...first, values: [] }] };
  }
  return {
    ...draft,
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
