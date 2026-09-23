import type { SalesProductBasicsRecord } from './sales-product-basics';

/**
 * 사방넷 엑셀을 다시 가져올 때 사람이 고친 값을 지키는 삼자 병합(KID-304) — 순수 함수.
 *
 * 칸마다 기준값은 지난 가져오기가 만든 값이다(저장된 `sourceRaw` 를 같은 매핑으로 다시 읽는다).
 * 지금 값이 기준값과 다르면 사람이 고친 것이라 지금 값을 지키고, 같으면 파일 값을 받는다. 기준값이
 * 없으면(원문이 없는 상품) 모든 칸을 지킨다. 상세 HTML 은 판매 상품 칸이 아니다 — Content 의
 * 상세 revision 이 정본이고, 다시 가져오기는 `imported` revision 을 쌓을 뿐 사람이 고친 revision 을 덮지
 * 않는다(KID-313 W2, `detail-page-import-rule`). 원문의 상세 디지스트가 그 revision 의 digest 다.
 *
 * 자체상품코드(`ownCode`)는 상품을 찾는 열쇠라 병합하지 않는다 — 지금 값이 있으면 그대로 두고, 비어 있을
 * 때만 파일 값으로 채운다.
 */

/** 병합하는 판매상품 기본 칸 — 저장소가 쓰는 기본 칸 그 자체다. */
export type SabangnetReimportBasics = SalesProductBasicsRecord;

/** 병합하는 칸과 그 순서(미리보기 `preserved` · `updated` 가 이 순서를 따른다). */
export const SABANGNET_REIMPORT_MERGED_FIELDS = [
  'name', 'shortName', 'englishName', 'printName', 'modelName', 'modelNo', 'brand', 'manufacturer',
  'originCountry', 'originRegion', 'keywords', 'standardCategory', 'description', 'targetAudience', 'ageGroup',
  'productSize', 'colorVariantNames', 'boxSetQuantity', 'registrationDefaults', 'status', 'taxType',
  'deliveryFeeType', 'deliveryFee', 'stockManaged', 'imageUrls',
  'noticeCategory', 'noticeValues', 'certifications', 'kcStatus', 'importDeclarationNo', 'adminMemo',
] as const satisfies readonly Exclude<keyof SabangnetReimportBasics, 'ownCode'>[];

export type SabangnetReimportField = (typeof SABANGNET_REIMPORT_MERGED_FIELDS)[number];

/**
 * 기본 칸에 새 칸이 생기면 병합 목록에도 넣어야 한다 — 빠지면 여기서 컴파일이 멈춘다. 새 칸을 병합하지 않으려면
 * `ownCode` 처럼 여기서 명시적으로 뺀다.
 */
type UnmergedBasicsField = Exclude<keyof SabangnetReimportBasics, SabangnetReimportField | 'ownCode'>;
const everyBasicsFieldIsMerged: [UnmergedBasicsField] extends [never] ? true : UnmergedBasicsField = true;
void everyBasicsFieldIsMerged;

/**
 * 사방넷 파일이 싣지 않는 초안 편집 칸. 가져오기 매핑이 빈 값으로만 채우므로 비교할 것이 없다 — 언제나
 * 지금 값을 지키고, 미리보기의 지킴 · 갱신 목록에도 넣지 않는다.
 */
export const SABANGNET_UNCARRIED_FIELDS = [
  'description', 'targetAudience', 'ageGroup', 'productSize', 'colorVariantNames', 'boxSetQuantity',
  'registrationDefaults',
] as const satisfies readonly SabangnetReimportField[];

const UNCARRIED = new Set<SabangnetReimportField>(SABANGNET_UNCARRIED_FIELDS);

export interface SabangnetReimportBaseline {
  basics: SabangnetReimportBasics;
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
}): SabangnetReimportMerge<T> {
  const { current, incoming, baseline } = input;
  const merged = { ...incoming, ownCode: current.ownCode ?? incoming.ownCode } as T;
  const preserved: SabangnetReimportField[] = [];
  const updated: SabangnetReimportField[] = [];
  for (const field of SABANGNET_REIMPORT_MERGED_FIELDS) {
    if (UNCARRIED.has(field) || sameImportValue(current[field], incoming[field])) {
      (merged as Record<string, unknown>)[field] = current[field];
      continue;
    }
    const edited = !baseline || !sameImportValue(current[field], baseline.basics[field]);
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
