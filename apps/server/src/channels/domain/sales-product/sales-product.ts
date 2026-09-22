import {
  salesProductOptionKey,
  type SalesProductOptionSupplyStatus,
  type SalesProductStatus,
  type SalesProductTaxType,
  type SalesProductDeliveryFeeType,
} from '@kiditem/shared/sales-product';

/**
 * 판매상품 도메인 규칙(ADR-0014) — 순수 함수만 둔다.
 *
 * 단품 교체는 "전체 교체"지만 몰 옵션에 연결된 단품은 지우지 않고 `unused` 로 남긴다 —
 * 몰에 올라간 옵션의 기준을 잃으면 수정 보내기 · 품절이 어디에 걸릴지 모른다.
 */

export interface ExistingSalesProductOption {
  id: string;
  optionCode: string;
  sabangnetOptionCode?: string | null;
  optionKey: string;
  linkedChannelOptionCount: number;
  executionCount?: number;
  /** Persistent registration targets still select this option. */
  registrationSelectionCount?: number;
  supplyStatus?: string;
  /** 초안은 아직 정하지 않아 비어 있을 수 있다. */
  salePrice?: number | null;
  components?: readonly { masterProductId: string; quantity: number }[];
}

export interface SalesProductOptionDraft {
  id?: string;
  optionCode?: string;
  sabangnetOptionCode?: string | null;
  values: string[];
  alias?: string | null;
  barcode?: string | null;
  salePrice: number | null;
  normalPrice: number | null;
  supplyStatus: SalesProductOptionSupplyStatus;
  safetyStock?: number | null;
  components: { masterProductId: string; quantity: number }[];
}

export interface PlannedOptionWrite {
  /** 있으면 그 단품을 고치고, 없으면 새로 만든다. */
  id: string | null;
  /** A used composition remains an immutable historical option. */
  replacesOptionId?: string;
  optionCode: string;
  sabangnetOptionCode?: string | null;
  optionKey: string;
  values: string[];
  alias: string | null;
  barcode: string | null;
  salePrice: number | null;
  normalPrice: number | null;
  supplyStatus: SalesProductOptionSupplyStatus;
  safetyStock: number | null;
  sortOrder: number;
  components: { masterProductId: string; quantity: number }[];
}

export interface SalesProductOptionReplacementPlan {
  writes: PlannedOptionWrite[];
  /** 입력에 없지만 몰 옵션에 연결돼 있어 `unused` 로 남길 단품. */
  retireIds: string[];
  /** 입력에 없고 연결도 없어 지울 단품. */
  deleteIds: string[];
}

export class SalesProductOptionPlanError extends Error {}

/**
 * 입력 단품을 기존 단품에 맞춘다: id → 옵션 값(optionKey) → 새 단품 순. 단품코드는 기존 것을 지키고,
 * 새 단품의 코드는 애플리케이션이 공통 KID 발급기로 채운다. 사방넷 번호는 별도 이관 식별자다.
 */
export function planSalesProductOptionReplacement(input: {
  productCode: string;
  existing: readonly ExistingSalesProductOption[];
  options: readonly SalesProductOptionDraft[];
}): SalesProductOptionReplacementPlan {
  const byId = new Map(input.existing.map((option) => [option.id, option]));
  const byCode = new Map(input.existing.map((option) => [option.optionCode, option]));
  const byKey = new Map(input.existing.filter((option) => option.supplyStatus !== 'unused').map((option) => [option.optionKey, option]));
  const claimed = new Set<string>();
  const bySourceCode = new Map(input.existing.filter(option => option.sabangnetOptionCode).map(option => [option.sabangnetOptionCode!, option]));

  const matched = input.options.map((option) => {
    const key = salesProductOptionKey(option.values);
    let target: ExistingSalesProductOption | undefined;
    if (option.id) {
      target = byId.get(option.id);
      if (!target) throw new SalesProductOptionPlanError(`단품 ${option.id} 는 이 판매상품의 단품이 아닙니다.`);
    } else {
      // 코드가 같으면 같은 단품이다(사방넷에서 옵션 이름만 바꾼 경우). 코드가 없으면 옵션 값으로 찾는다.
      const sameCode = option.sabangnetOptionCode ? bySourceCode.get(option.sabangnetOptionCode)
        : option.optionCode ? byCode.get(option.optionCode.trim()) : undefined;
      const sameKey = byKey.get(key);
      if (sameCode && !claimed.has(sameCode.id)) target = sameCode;
      else if (!option.optionCode && sameKey && !claimed.has(sameKey.id)) target = sameKey;
    }
    if (target) {
      if (claimed.has(target.id)) throw new SalesProductOptionPlanError('같은 단품을 두 번 고칠 수 없습니다.');
      claimed.add(target.id);
    }
    return { option, key, target };
  });

  const replacedIds = new Set<string>();
  const writes = matched.map(({ option, key, target }, index): PlannedOptionWrite => {
    const replaceIdentity = !!target
      && (target.linkedChannelOptionCount > 0 || (target.executionCount ?? 0) > 0)
      && (target.components?.length ?? 0) > 0
      && compositionKey(target.components ?? []) !== compositionKey(option.components);
    if (replaceIdentity) replacedIds.add(target!.id);
    const optionCode = replaceIdentity ? '' : target?.optionCode ?? '';
    return {
      id: replaceIdentity ? null : target?.id ?? null,
      ...(replaceIdentity ? { replacesOptionId: target!.id } : {}),
      optionCode,
      sabangnetOptionCode: target?.sabangnetOptionCode ?? option.sabangnetOptionCode ?? null,
      optionKey: key,
      values: option.values.map((value) => value.trim()),
      alias: blankToNull(option.alias),
      barcode: blankToNull(option.barcode),
      salePrice: option.salePrice,
      normalPrice: option.normalPrice,
      supplyStatus: option.supplyStatus,
      safetyStock: option.safetyStock ?? null,
      sortOrder: index,
      components: option.components,
    };
  });

  const retireIds: string[] = [];
  const deleteIds: string[] = [];
  for (const option of input.existing) {
    if (claimed.has(option.id) && !replacedIds.has(option.id)) continue;
    if (option.linkedChannelOptionCount > 0
      || (option.executionCount ?? 0) > 0
      || (option.registrationSelectionCount ?? 0) > 0) retireIds.push(option.id);
    else deleteIds.push(option.id);
  }
  return { writes, retireIds, deleteIds };
}

function compositionKey(components: readonly { masterProductId: string; quantity: number }[]): string {
  return JSON.stringify([...components].sort((a, b) => a.masterProductId.localeCompare(b.masterProductId))
    .map(({ masterProductId, quantity }) => [masterProductId, quantity]));
}

/** 가져오기 지문에 넣는 기본 칸. 저장소와 가져오기 서비스가 같은 목록을 쓴다. */
export const SALES_PRODUCT_FINGERPRINT_FIELDS = [
  'name', 'ownCode', 'shortName', 'englishName', 'printName', 'modelName', 'modelNo', 'brand', 'manufacturer',
  'originCountry', 'originRegion', 'keywords', 'standardCategory', 'status', 'taxType', 'deliveryFeeType',
  'deliveryFee', 'stockManaged', 'imageUrls', 'detailHtml', 'extraDetailHtml',
  'noticeCategory', 'noticeValues', 'certifications', 'importDeclarationNo', 'adminMemo',
] as const;

export function pickFingerprintBasics(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(SALES_PRODUCT_FINGERPRINT_FIELDS.map((field) => [field, record[field] ?? null]));
}

/**
 * 가져오기가 "바뀐 게 없음"을 가르는 지문 — 기본 칸과 단품(코드 · 값 · 추가금액 · 상태 · 셀피아 구성).
 * 저장소는 DB 줄을 같은 모양으로 바꿔 같은 함수를 부른다.
 */
export function salesProductImportFingerprint(input: {
  basics: Record<string, unknown>;
  optionAxes: readonly string[];
  options: readonly {
    optionCode: string;
    optionKey: string;
    salePrice: number | null;
    normalPrice: number | null;
    supplyStatus: string;
    components: readonly { masterProductId: string; quantity: number }[];
  }[];
}): string {
  const basics = Object.keys(input.basics).sort().map((key) => [key, input.basics[key] ?? null]);
  const options = [...input.options]
    .sort((left, right) => left.optionCode.localeCompare(right.optionCode))
    .map((option) => [
      option.optionCode,
      option.optionKey,
      option.salePrice,
      option.normalPrice,
      option.supplyStatus,
      [...option.components]
        .sort((left, right) => left.masterProductId.localeCompare(right.masterProductId))
        .map((component) => [component.masterProductId, component.quantity]),
    ]);
  return JSON.stringify([basics, input.optionAxes, options]);
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// ── 사방넷 숫자 코드 → 우리 어휘 ───────────────────────────────────────

/** 사방넷 상품상태: 대기중 1 · 공급중 2 · 일시중지 3 · 완전품절 4 · 미사용 5 · 삭제 6 · 자료없음 7. */
export function salesProductStatusFromSabangnet(code: string | null | undefined): SalesProductStatus {
  switch (String(code ?? '').trim()) {
    case '2': return 'active';
    case '3': return 'paused';
    case '4': return 'sold_out';
    case '5': return 'unused';
    case '6': return 'archived';
    default: return 'draft';
  }
}

/** 사방넷 단품 공급상태: 판매 1 · 품절 2 · 미사용 3. */
export function optionSupplyStatusFromSabangnet(code: string | null | undefined): SalesProductOptionSupplyStatus {
  switch (String(code ?? '').trim()) {
    case '2': return 'sold_out';
    case '3': return 'unused';
    default: return 'selling';
  }
}

/** 사방넷 세금구분: 과세 1 · 면세 2 · 자료없음 3 · 비과세 4 · 영세 5. */
export function taxTypeFromSabangnet(code: string | null | undefined): SalesProductTaxType {
  switch (String(code ?? '').trim()) {
    case '1': return 'taxable';
    case '2':
    case '4': return 'tax_free';
    case '5': return 'zero_rated';
    default: return 'unknown';
  }
}

/** 사방넷 배송비구분: 무료 1 · 착불 2 · 선결제 3 · 착불/선결제 4. */
export function deliveryFeeTypeFromSabangnet(code: string | null | undefined): SalesProductDeliveryFeeType | null {
  switch (String(code ?? '').trim()) {
    case '1': return 'free';
    case '2': return 'collect';
    case '3': return 'prepay';
    case '4': return 'collect_or_prepay';
    default: return null;
  }
}

/** 사방넷은 옵션 없는 상품을 옵션제목 · 옵션상세명칭 '단품' 한 줄로 적는다. */
export function isSabangnetSingleOption(title: string | null | undefined, value: string | null | undefined): boolean {
  return (title ?? '').trim() === '단품' || (value ?? '').trim() === '단품';
}
