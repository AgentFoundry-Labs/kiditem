/**
 * KID(판매상품코드 · 단품코드) 발급 정책 — 순수 함수만 둔다(KID-310 · ADR-0022).
 *
 * 사장님 결정(2026-09-23): **팔기로 정한 시점**에 발급한다. 수집한 초안은 코드 없이 만들어지고,
 * 첫 등록 설정을 만들거나 몰 엑셀 파일을 뽑을 때 비로소 번호를 받는다 — 안 팔 상품이 번호를
 * 소모하지 않는다.
 *
 * 발급을 부르는 자리는 네 곳뿐이다:
 * `registration-target.repository.adapter.ts`(첫 등록 설정),
 * `sales-product-mall-sheet.service.ts`(몰 엑셀 파일),
 * `sales-product.usecase.ts`(직접 작성),
 * `sabangnet-product-import.service.ts`(사방넷은 품번코드를 그대로 쓴다).
 */

export interface KidIssuePlan {
  /** 상품 KID 를 발급해야 하는가. */
  product: boolean;
  /** 새 번호를 받아야 하는 단품 id — 입력 순서 그대로. */
  optionIds: string[];
  /** 원천 셀피아 코드를 그대로 쓰는 단품 id → 그 코드. */
  reuse: Record<string, string>;
}

/**
 * 무엇을 발급해야 하는지 센다. 이미 있는 코드는 그대로 두므로 같은 상품을 두 번 불러도 결과가 같다.
 *
 * 셀피아 단품 하나(수량 1)로만 이루어진 단품은 그 원천 KID 를 다시 쓴다 — 같은 물건에 번호를
 * 둘 붙이면 창고와 몰이 서로 다른 번호를 부른다.
 */
export function planKidIssue(input: {
  code: string | null;
  options: readonly {
    id: string;
    optionCode: string | null;
    components: readonly { masterProductId: string; quantity: number }[];
  }[];
  masterProductCodes?: ReadonlyMap<string, string>;
}): KidIssuePlan {
  const plan: KidIssuePlan = { product: input.code === null, optionIds: [], reuse: {} };
  for (const option of input.options) {
    if (option.optionCode !== null) continue;
    const only = option.components.length === 1 ? option.components[0] : undefined;
    const sourceCode = only?.quantity === 1 ? input.masterProductCodes?.get(only.masterProductId) : undefined;
    if (sourceCode) plan.reuse[option.id] = sourceCode;
    else plan.optionIds.push(option.id);
  }
  return plan;
}
