import type { SellpiaProductAbcGrade } from '@kiditem/shared/dashboard';

export const SELLPIA_ABC_GRADE_PORT = Symbol('SELLPIA_ABC_GRADE_PORT');

/**
 * 재고분석 '상품별 소진'의 ABC 등급을 소비하기 위한 anti-corruption 포트.
 * 구현은 analytics 의 SellpiaProductSalesService(getAbcGradeByCode)에 바인딩된다.
 * 키는 `{productCode}-{optionCode}`(= SellpiaInventorySku.code = MasterProduct.code).
 */
export interface SellpiaAbcGradePort {
  getAbcGradeByCode(
    organizationId: string,
  ): Promise<Map<string, SellpiaProductAbcGrade>>;
}
