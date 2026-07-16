import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

// Sellpia 상품별 이익현황(stat_prd_profit) 월별 소진 ingest 요청 DTO.
// 확장이 stat_action.ajax.html(mode=stat_prd_profit)의 graph(월별)에서 상품별로 스크랩.
// `@Body()` 는 organizationId 를 받지 않는다(세션 소유).

export class SellpiaProductSalesIngestMonthDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'yearMonth must be YYYY-MM' })
  yearMonth!: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  orderQty!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  orderAmount!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  inQty!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  inAmount!: number;
}

export class SellpiaProductSalesIngestItemDto {
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

  @IsNumber({ allowInfinity: false, allowNaN: false })
  salePrice!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  buyPrice!: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => SellpiaProductSalesIngestMonthDto)
  months!: SellpiaProductSalesIngestMonthDto[];
}

export class SellpiaProductSalesRangeDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to!: string;
}

export class SellpiaProductSalesIngestBodyDto {
  @ValidateNested()
  @Type(() => SellpiaProductSalesRangeDto)
  range!: SellpiaProductSalesRangeDto;

  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => SellpiaProductSalesIngestItemDto)
  products!: SellpiaProductSalesIngestItemDto[];
}

export class SellpiaProductStockIngestItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  productCode!: string;

  @IsString()
  @MaxLength(64)
  optionCode!: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  currentStock!: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  offStock?: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  safeStock?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string | null;
}

export class SellpiaProductStockIngestBodyDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'capturedDate must be YYYY-MM-DD' })
  capturedDate!: string;

  @IsArray()
  @ArrayMaxSize(20000)
  @ValidateNested({ each: true })
  @Type(() => SellpiaProductStockIngestItemDto)
  items!: SellpiaProductStockIngestItemDto[];
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
