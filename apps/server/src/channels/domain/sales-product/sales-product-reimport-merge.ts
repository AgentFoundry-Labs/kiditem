import type {
  SalesProductCertification,
  SalesProductDeliveryFeeType,
  SalesProductKcStatus,
  SalesProductStatus,
  SalesProductTaxType,
} from '@kiditem/shared/sales-product';

/**
 * 사방넷 엑셀을 다시 가져올 때 사람이 고친 값을 지키는 삼자 병합(KID-304) — 순수 함수.
 *
 * 칸마다 기준값은 지난 가져오기가 만든 값이다(저장된 `sourceRaw` 를 같은 매핑으로 다시 읽는다).
 * 지금 값이 기준값과 다르면 사람이 고친 것이라 지금 값을 지키고, 같으면 파일 값을 받는다. 기준값이
 * 없으면(원문이 없는 상품) 모든 칸을 지킨다. 상세 HTML 은 원문에 본문 대신 디지스트만 있어서
 * 디지스트로 비교하고, 디지스트가 없으면(디지스트를 남기기 전에 가져온 줄) 상세를 지킨다.
 *
 * 자체상품코드(`ownCode`)는 상품을 찾는 열쇠라 병합하지 않는다 — 언제나 지금 값이다.
 */

export interface SabangnetReimportBasics {
  name: string;
  ownCode: string | null;
  shortName: string | null;
  englishName: string | null;
  printName: string | null;
  modelName: string | null;
  modelNo: string | null;
  brand: string | null;
  manufacturer: string | null;
  originCountry: string | null;
  originRegion: string | null;
  keywords: string[];
  standardCategory: string | null;
  description: string;
  targetAudience: string | null;
  ageGroup: string | null;
  productSize: string | null;
  colorVariantNames: string[];
  boxSetQuantity: number | null;
  registrationDefaults: Record<string, unknown> | null;
  status: SalesProductStatus;
  taxType: SalesProductTaxType;
  deliveryFeeType: SalesProductDeliveryFeeType | null;
  deliveryFee: number | null;
  stockManaged: boolean;
  imageUrls: string[];
  detailHtml: string | null;
  extraDetailHtml: string[];
  noticeCategory: string | null;
  noticeValues: string[];
  certifications: SalesProductCertification[];
  kcStatus: SalesProductKcStatus;
  importDeclarationNo: string | null;
  adminMemo: string | null;
}

type DetailField = 'detailHtml' | 'extraDetailHtml';

/** 병합하는 칸과 그 순서(미리보기 `preserved` · `updated` 가 이 순서를 따른다). */
export const SABANGNET_REIMPORT_MERGED_FIELDS = [
  'name', 'shortName', 'englishName', 'printName', 'modelName', 'modelNo', 'brand', 'manufacturer',
  'originCountry', 'originRegion', 'keywords', 'standardCategory', 'description', 'targetAudience', 'ageGroup',
  'productSize', 'colorVariantNames', 'boxSetQuantity', 'registrationDefaults', 'status', 'taxType',
  'deliveryFeeType', 'deliveryFee', 'stockManaged', 'imageUrls', 'detailHtml', 'extraDetailHtml',
  'noticeCategory', 'noticeValues', 'certifications', 'kcStatus', 'importDeclarationNo', 'adminMemo',
] as const satisfies readonly Exclude<keyof SabangnetReimportBasics, 'ownCode'>[];

export type SabangnetReimportField = (typeof SABANGNET_REIMPORT_MERGED_FIELDS)[number];

/** 상세 HTML 디지스트. 빈 상세는 빈 문자열이다. 추가 상세는 칸마다의 디지스트를 쉼표로 잇는다. */
export interface SabangnetDetailDigests {
  detailHtml: string;
  extraDetailHtml: string;
}

export interface SabangnetReimportBaseline {
  basics: Omit<SabangnetReimportBasics, DetailField>;
  /** 없으면 상세 기준값을 모른다 — 상세는 지금 값을 지킨다. */
  detailDigests: SabangnetDetailDigests | null;
}

export function sabangnetDetailDigests(
  detail: { detailHtml: string | null; extraDetailHtml: readonly string[] },
  sha256: (value: string) => string,
): SabangnetDetailDigests {
  return {
    detailHtml: detail.detailHtml ? sha256(detail.detailHtml) : '',
    extraDetailHtml: detail.extraDetailHtml.map((html) => sha256(html)).join(','),
  };
}

export interface SabangnetReimportMerge<T extends SabangnetReimportBasics> {
  merged: T;
  /** 파일 값이 달랐지만 사람이 고친 값이라 지킨 칸. */
  preserved: SabangnetReimportField[];
  /** 사람이 고치지 않아 파일 값으로 바꾼 칸. */
  updated: SabangnetReimportField[];
}

export function mergeSabangnetReimport<T extends SabangnetReimportBasics>(input: {
  current: SabangnetReimportBasics;
  incoming: T;
  baseline: SabangnetReimportBaseline | null;
  sha256: (value: string) => string;
}): SabangnetReimportMerge<T> {
  const { current, incoming, baseline } = input;
  const merged = { ...incoming, ownCode: current.ownCode } as T;
  const preserved: SabangnetReimportField[] = [];
  const updated: SabangnetReimportField[] = [];
  const currentDigests = sabangnetDetailDigests(current, input.sha256);
  for (const field of SABANGNET_REIMPORT_MERGED_FIELDS) {
    if (sameImportValue(current[field], incoming[field])) {
      (merged as Record<string, unknown>)[field] = current[field];
      continue;
    }
    const edited = !baseline
      ? true
      : field === 'detailHtml' || field === 'extraDetailHtml'
        ? !baseline.detailDigests || baseline.detailDigests[field] !== currentDigests[field]
        : !sameImportValue(current[field], baseline.basics[field]);
    if (edited) {
      (merged as Record<string, unknown>)[field] = current[field];
      preserved.push(field);
    } else {
      updated.push(field);
    }
  }
  return { merged, preserved, updated };
}

/** 값으로 비교한다. 배열은 순서까지, 객체는 키 순서와 무관하게, null 과 undefined 는 같다. */
export function sameImportValue(left: unknown, right: unknown): boolean {
  if (left === undefined || left === null || right === undefined || right === null) {
    return (left ?? null) === (right ?? null);
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => sameImportValue(value, right[index]));
  }
  if (typeof left === 'object' && typeof right === 'object') {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
    return [...keys].every((key) => sameImportValue(leftRecord[key], rightRecord[key]));
  }
  return left === right;
}
