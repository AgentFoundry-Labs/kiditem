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
 */
export function preparedRegistrationRecipe(payload: unknown): PreparedRegistrationRecipe | null {
  const outer = record(payload);
  if ('adapterPayload' in outer) return frozenRecipe(record(outer.adapterPayload), 'vendorItemCode');
  const input = record(outer.registrationInput);
  if (input.kidItemCode === undefined) return null;
  const match = record(input.sellpiaMatch);
  if (typeof input.kidItemCode !== 'string' || !/^KID[0-9]{8}$/.test(input.kidItemCode)
    || typeof match.sellpiaInventorySkuId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(match.sellpiaInventorySkuId)
    || !Number.isSafeInteger(match.quantity) || Number(match.quantity) <= 0) {
    throw new Error('Frozen registration item code or source recipe is invalid');
  }
  return { kidItemCode: input.kidItemCode, masterProductId: match.sellpiaInventorySkuId, quantity: Number(match.quantity) };
}

function frozenRecipe(frozen: Record<string, unknown>, codeKey: string): PreparedRegistrationRecipe | null {
  if (frozen.sellpiaMatch === undefined) return null;
  const code = frozen[codeKey];
  const match = record(frozen.sellpiaMatch);
  if (typeof code !== 'string' || !/^KID[0-9]{8}$/.test(code)
    || typeof match.sellpiaInventorySkuId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(match.sellpiaInventorySkuId)
    || !Number.isSafeInteger(match.quantity) || Number(match.quantity) <= 0) {
    throw new Error('Frozen registration item code or source recipe is invalid');
  }
  return { kidItemCode: code, masterProductId: match.sellpiaInventorySkuId, quantity: Number(match.quantity) };
}

export function withRegistrationItemCode(input: Record<string, unknown>, code: string): Record<string, unknown> {
  const wing = record(input.wingProduct);
  const variants = Array.isArray(wing.variants) ? wing.variants : [];
  if (variants.length !== 1) throw new Error('A prepared WING registration requires one variant');
  return { ...input, kidItemCode: code, wingProduct: {
    ...wing, variants: [{ ...record(variants[0]), vendorItemCode: code }],
  } };
}

/** Compare retries against the original request, without trusting a caller-assigned code. */
export function registrationRequestBeforeCodeAssignment(payload: unknown): unknown {
  const outer = record(payload);
  const input = record(outer.registrationInput);
  if (!preparedRegistrationRecipe(payload)) return payload;
  const { kidItemCode: _code, ...original } = input;
  const sourceCode = record(input.sellpiaMatch).code;
  const wing = record(input.wingProduct);
  const variants = Array.isArray(wing.variants) ? wing.variants : [];
  return { ...outer, registrationInput: { ...original, wingProduct: {
    ...wing, variants: variants.map((variant) => ({ ...record(variant), vendorItemCode: sourceCode })),
  } } };
}
