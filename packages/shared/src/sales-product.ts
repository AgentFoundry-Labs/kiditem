export * from './schemas/listing-availability-execution.js';
export * from './schemas/registration-target-execution.js';
export * from './schemas/registration-target.js';
export * from './schemas/registration-state.js';
export * from './schemas/sales-product.js';

/**
 * 숫자 뒤에 바로 붙으면 가격이 아니라 규격이다(`110g 초경량 …` · `100p 클립`).
 */
const SPEC_UNIT = /^(?:(?:g|kg|mg|ml|l|cm|mm|m|p|ea|pcs)(?![a-z])|개입|개|매|장|권|색|종|단|호|구|인치)/i;

/**
 * 셀피아 원본명 앞의 소비자가(`3500 게틀링 …` · `700받아쓰기노트`)를 뗀 몰 표시용 이름.
 *
 * 몰 등록 폼과 몰 대량등록 엑셀이 같은 이름을 보내야 해서 여기 한 곳에 둔다. 세 자리 이상 숫자만 떼고,
 * 숫자에 단위가 바로 붙은 이름은 규격이라 그대로 둔다 — `110g 초경량 우산` 을 `g 초경량 우산` 으로 보내면 몰에
 * 그 이름으로 등록된다(2026-09-20 실데이터에서 발견).
 */
export function mallDisplayName(name: string): string {
  return splitNamePriceCode(name).rest;
}

function splitNamePriceCode(name: string): { priceCode: number | null; rest: string } {
  const trimmed = name.trim();
  const match = /^(\d{3,})(?!\d)(\s*)(?=\S)/.exec(trimmed);
  if (!match) return { priceCode: null, rest: trimmed };
  const rest = trimmed.slice(match[0].length);
  // 숫자에 단위가 바로 붙었으면 규격이다(`110g 초경량 …`).
  if (!match[2] && SPEC_UNIT.test(rest)) return { priceCode: null, rest: trimmed };
  return { priceCode: Number(match[1]), rest: rest.trim() || trimmed };
}
