import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

// Sellpia 상품별 이익현황(stat_prd_profit) 월별 소진 ingest 요청 DTO.
// 확장이 graph 판매 facts와 purchase-period 상단 합계를 함께 검증해 전송한다.
// `@Body()` 는 organizationId 를 받지 않는다(세션 소유).

export class SellpiaProfitabilityMonthDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'yearMonth must be YYYY-MM' })
  yearMonth!: string;

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  orderQty!: number;

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  orderAmount!: number;

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  inQty!: number;

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  inAmount!: number;
}

export class SellpiaProfitabilityProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/\S/)
  productCode!: string;

  @IsString()
  @MaxLength(64)
  optionCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(400)
  productName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  optionName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerName?: string;

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  salePrice!: number;

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  buyPrice!: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  totalOrderAmount!: number;

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  totalOrderQty!: number;

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  totalInAmount!: number;

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  totalInQty!: number;

  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => SellpiaProfitabilityMonthDto)
  months!: SellpiaProfitabilityMonthDto[];
}

export class SellpiaProfitabilityProvenanceDto {
  @Equals('sellpia_stat_prd_profit')
  source!: 'sellpia_stat_prd_profit';

  @Equals('ORDER_TIME_SUPPLY_COST')
  costBasis!: 'ORDER_TIME_SUPPLY_COST';

  @Equals(true)
  vatIncluded!: true;
}

export class SellpiaProfitabilityBeginBodyDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'normalizedSourceAvailabilityDate must be YYYY-MM-DD' })
  normalizedSourceAvailabilityDate?: string;
}

export class SellpiaProfitabilitySubmitBodyDto {
  @IsString()
  @IsUUID()
  attemptToken!: string;

  @IsString()
  @Equals('sellpia-profitability-v2')
  parserVersion!: 'sellpia-profitability-v2';

  @IsBoolean()
  providerBackedEmptyProof!: boolean;

  @IsArray()
  @ArrayMaxSize(24)
  @IsString({ each: true })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { each: true })
  coveredMonths!: string[];

  @ValidateNested()
  @Type(() => SellpiaProfitabilityProvenanceDto)
  provenance!: SellpiaProfitabilityProvenanceDto;

  @IsArray()
  @ArrayMaxSize(20_000)
  @ValidateNested({ each: true })
  @Type(() => SellpiaProfitabilityProductDto)
  products!: SellpiaProfitabilityProductDto[];
}

export class SellpiaProfitabilityFailureBodyDto {
  @IsString()
  @IsUUID()
  attemptToken!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  errorCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  errorMessage!: string;
}

export class SellpiaProductSalesQueryDto {
  // 최근 N개월 조회(기본 13=1년). 평균/추세/시즌은 완결 월(현재 월 제외)에서 산정.
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(24)
  @Type(() => Number)
  months?: number;
}
