import type { MallProfileField } from '../registration/mall-adapter-manifest';

/**
 * 몰 계정 하나의 등록 기본값 — 그 몰 `ChannelAccount` 행의 `config.listingProfile` 문서.
 *
 * 몰 행 하나에 문서 하나다(ADR-0012). 송신 전 점검은 이 문서 하나만 읽으므로 이름 · 기본
 * 여부 · 여러 벌을 두지 않는다 — 여러 벌이 실제로 필요해지면 그때 표로 올린다. 몰 계정 행을
 * 만들고 고치는 곳은 Orders 쇼핑몰 계정 서비스 하나라, 여기는 읽기만 한다.
 */
export interface MallListingProfile {
  shipping: Readonly<Record<string, unknown>> | null;
  returnPolicy: Readonly<Record<string, unknown>> | null;
  releaseAddress: Readonly<Record<string, unknown>> | null;
  returnAddress: Readonly<Record<string, unknown>> | null;
  asPhone: string | null;
  /** 이 몰에서 쓰는 카테고리 코드. 상품 × 몰 카테고리 매핑이 생기기 전까지의 몰 단위 값이다. */
  categoryCode: string | null;
  namePrefix: string | null;
  nameSuffix: string | null;
}

export const LISTING_PROFILE_CONFIG_KEY = 'listingProfile';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 값이 하나라도 들어 있는 객체만. 빈 객체는 "저장한 적 없다"와 같다. */
function filledRecord(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  return record && Object.keys(record).length > 0 ? record : null;
}

function filledString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * 계정 행의 `config` 에서 등록 기본값 문서를 읽는다. 문서가 없거나 객체가 아니면 null.
 *
 * 모르는 키는 버리고 타입이 맞지 않는 값은 비어 있는 것으로 본다 — 검증기는 값이 실제로
 * 들어 있는지를 기준으로 판정한다.
 */
export function readMallListingProfile(config: unknown): MallListingProfile | null {
  const doc = asRecord(asRecord(config)?.[LISTING_PROFILE_CONFIG_KEY]);
  if (!doc) return null;
  return {
    shipping: filledRecord(doc.shipping),
    returnPolicy: filledRecord(doc.returnPolicy),
    releaseAddress: filledRecord(doc.releaseAddress),
    returnAddress: filledRecord(doc.returnAddress),
    asPhone: filledString(doc.asPhone),
    categoryCode: filledString(doc.categoryCode),
    namePrefix: filledString(doc.namePrefix),
    nameSuffix: filledString(doc.nameSuffix),
  };
}

/**
 * 문서가 실제로 채운 필드.
 *
 * 저장돼 있다는 것과 값이 들어 있다는 것은 다르다. 빈 문서로 송신이 시작되면 몰이 거절한다.
 */
export function filledListingProfileFields(profile: MallListingProfile): MallProfileField[] {
  const fields: MallProfileField[] = [];
  if (profile.shipping) fields.push('shipping');
  if (profile.returnPolicy) fields.push('returnPolicy');
  if (profile.releaseAddress) fields.push('releaseAddress');
  if (profile.returnAddress) fields.push('returnAddress');
  if (profile.asPhone) fields.push('asPhone');
  return fields;
}
