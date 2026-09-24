import { KiditemError } from '@kiditem/shared/errors';

export type PreparedRegistrationRecipe = Readonly<{
  kidItemCode: string;
  masterProductId: string;
  quantity: number;
}>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

/**
 * 등록 실행이 얼린 셀피아 레시피. 등록 대상 실행은 채널 어댑터가 준비 때 얼린 `adapterPayload` 에
 * 매칭(`sellpiaMatch`)과 몰 옵션 코드(`vendorItemCode` = 옵션 KID)를 둔다(KID-321). 매칭이 없으면 null.
 * 몰 옵션이 나중에 카탈로그 가져오기로 들어와도 같은 레시피를 그 코드의 옵션에 건다.
 */
export function preparedRegistrationRecipe(payload: unknown): PreparedRegistrationRecipe | null {
  const frozen = record(record(payload).adapterPayload);
  if (frozen.sellpiaMatch === undefined) return null;
  const code = frozen.vendorItemCode;
  const match = record(frozen.sellpiaMatch);
  if (typeof code !== 'string' || !/^KID[0-9]{8}$/.test(code)
    || typeof match.sellpiaInventorySkuId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(match.sellpiaInventorySkuId)
    || !Number.isSafeInteger(match.quantity) || Number(match.quantity) <= 0) {
    throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'FROZEN_ITEM_CODE_INVALID' } });
  }
  return { kidItemCode: code, masterProductId: match.sellpiaInventorySkuId, quantity: Number(match.quantity) };
}
