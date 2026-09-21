export const MASTER_PRODUCT_PROFIT_FACT_READ_PORT = Symbol(
  'MASTER_PRODUCT_PROFIT_FACT_READ_PORT',
);

export type MasterProductMonthlyProfitFact = Readonly<{
  masterProductId: string;
  yearMonth: string;
  coverageStartDate: Date;
  coverageEndDate: Date;
  coveredDays: number;
  revenue: number;
  /** 그달 팔린 개수(셀피아 주문 수량 합). */
  orderQty: number;
  /**
   * 그달 판 물건의 원가 = Σ(팔린 개수 × 매입 단가).
   *
   * `sellpiaInAmount` 와 다르다. 저쪽은 그달 **매입금액**(창고에 들인 돈)이라, 대량 입고한 달은
   * 판매액의 몇십 배가 되어 이익처럼 빼면 말이 안 된다(사장님 2026-09-21에 발견).
   */
  soldCost: number;
  /**
   * 판 줄마다 매입 단가가 있었는가. `soldCost` 는 줄의 합이라 한 줄만 단가가 0 이어도 합은
   * 0 보다 커서 '아는 값' 처럼 보인다 — 그 줄의 매출은 통째로 이익이 되어 이익률을
   * 부풀린다. 원가를 안다고 말하려면 이 값이 참이어야 한다(2026-09-21 점검).
   */
  soldCostComplete: boolean;
  sellpiaInAmount: number;
  sourceProductCodes: readonly string[];
  sourceOptionCodes: readonly string[];
  capturedAt: Date;
}>;

export type MasterProductProfitFactEvidence = Readonly<{
  masterProductId: string;
  mappingStatus: 'MAPPED' | 'UNMAPPED' | 'STALE';
  mappingInventoryGeneration: string | null;
  mappingVerifiedAt: Date | null;
  monthlyFacts: readonly MasterProductMonthlyProfitFact[];
}>;

export type OrphanSellpiaProductProfitFact = Readonly<{
  productCode: string;
  optionCode: string;
  barcode: string | null;
  yearMonth: string;
  reason:
    | 'SOURCE_UNMAPPED'
    | 'AMBIGUOUS_MASTER_PRODUCT'
    | 'LEGACY_COVERAGE_MISSING'
    | 'COST_PROVENANCE_MISSING'
    | 'COVERAGE_MISMATCH';
}>;

export type MasterProductProfitFactSnapshot = Readonly<{
  evidence: readonly MasterProductProfitFactEvidence[];
  orphanFacts: readonly OrphanSellpiaProductProfitFact[];
}>;

/**
 * Analytics owns resolving raw Sellpia product-profit facts to a product recipe.
 * It exposes facts only; Finance assembles costs and Products owns ABC grades.
 */
export interface MasterProductProfitFactReadPort {
  readProfitFacts(input: {
    organizationId: string;
    masterProductIds: readonly string[];
    range: { from: Date; to: Date };
  }): Promise<MasterProductProfitFactSnapshot>;
}
