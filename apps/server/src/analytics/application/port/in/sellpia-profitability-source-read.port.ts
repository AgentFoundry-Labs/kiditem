import type {
  SellpiaProfitabilityAttemptSummary,
} from '@kiditem/shared/source-import';

export const SELLPIA_PROFITABILITY_SOURCE_READ_PORT = Symbol(
  'SELLPIA_PROFITABILITY_SOURCE_READ_PORT',
);

export type SellpiaProfitabilityParserVersion =
  | 'sellpia-profitability-v1'
  | 'sellpia-profitability-v2';

export type SellpiaProfitabilityProvenance = Readonly<{
  source: 'sellpia_stat_prd_profit';
  costBasis: 'ORDER_TIME_SUPPLY_COST';
  vatIncluded: true;
}>;

export type SellpiaProfitabilityQuality = Readonly<{
  contract: SellpiaProfitabilityParserVersion;
  parserVersion: SellpiaProfitabilityParserVersion;
  /** v2 proves period-total purchase cost; v1 graph cost remains legacy-readable only. */
  correctedCostEvidence: boolean;
  contentChecksum: string;
  contentByteCount: number;
  includedRowCount: number;
  excludedRowCount: number;
  mappedRowCount: number;
  unmappedRowCount: number;
  warningCount: number;
  mappingGeneration: string;
  provenance: SellpiaProfitabilityProvenance;
}>;

/** 셀피아 상품 손익 세대 = 성공한 `analytics.sellpia_product_profitability` 실행 하나(KID-361). */
export type SellpiaProfitabilityGenerationMetadata = Readonly<{
  operationId: string;
  publicationSequence: string;
  mappingGeneration: string;
  coverage: Readonly<{
    from: string;
    to: string;
    coveredMonths: readonly string[];
  }>;
  capturedAt: string;
  quality: SellpiaProfitabilityQuality;
}>;

export type SellpiaProfitabilitySourceCatalog = Readonly<{
  latestAttempt: SellpiaProfitabilityAttemptSummary | null;
  completeGenerations: readonly SellpiaProfitabilityGenerationMetadata[];
}>;

export type SellpiaProfitabilityFact = Readonly<{
  operationId: string;
  sellpiaInventorySkuId: string;
  masterProductId: string;
  productCode: string;
  optionCode: string;
  yearMonth: string;
  coverageStartDate: string;
  coverageEndDate: string;
  revenue: number;
  orderTimeSupplyCost: number;
  costBasis: 'ORDER_TIME_SUPPLY_COST';
  vatIncluded: true;
  capturedAt: string;
}>;

export type SellpiaUnmappedProfitabilityFact = Readonly<{
  operationId: string;
  sellpiaInventorySkuId: string | null;
  masterProductId: string | null;
  productCode: string;
  optionCode: string;
  yearMonth: string;
  coverageStartDate: string | null;
  coverageEndDate: string | null;
  revenue: number;
  orderTimeSupplyCost: number;
  costBasis: 'ORDER_TIME_SUPPLY_COST';
  vatIncluded: true;
  reason: 'SOURCE_UNMAPPED';
  capturedAt: string;
}>;

export type SellpiaProfitabilityGenerationFacts = Readonly<{
  generation: SellpiaProfitabilityGenerationMetadata;
  facts: readonly SellpiaProfitabilityFact[];
  unmappedFacts: readonly SellpiaUnmappedProfitabilityFact[];
}>;

export interface SellpiaProfitabilitySourceReadPort {
  readGenerationCatalog(input: {
    organizationId: string;
    limit?: number;
  }): Promise<SellpiaProfitabilitySourceCatalog>;

  readGenerationFacts(input: {
    organizationId: string;
    operationId: string;
    masterProductIds?: readonly string[];
    yearMonths?: readonly string[];
  }): Promise<SellpiaProfitabilityGenerationFacts>;
}
