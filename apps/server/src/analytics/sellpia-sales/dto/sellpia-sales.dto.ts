import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayMaxSize,
  Equals,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

// Sellpia 판매현황(sale_summary) 몰별 매출 ingest 요청 DTO.
// 확장이 order_search.ajax.html(mode=selldate)에서 판매처(seller)별로 스크랩한 결과.
// `@Body()` 는 organizationId 를 받지 않는다(세션 소유).

export class SellpiaSalesIngestDayDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  price!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  amount!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  buyPrice!: number;
}

export class SellpiaSalesIngestSellerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/\S/)
  sellerId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/\S/)
  sellerName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SellpiaSalesIngestDayDto)
  days!: SellpiaSalesIngestDayDto[];
}

export class SellpiaSalesRangeDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to!: string;
}

export class SellpiaSalesExplicitEmptyProvenanceDto {
  @Equals('sellpia_sale_summary')
  source!: 'sellpia_sale_summary';

  @Equals('selldate')
  mode!: 'selldate';

  @Equals('all')
  sellerScope!: 'all';

  @Equals('empty_object')
  responseShape!: 'empty_object';

  @Equals(true)
  explicitEmpty!: true;
}

export class SellpiaSalesIngestBodyDto {
  @ValidateNested()
  @Type(() => SellpiaSalesRangeDto)
  range!: SellpiaSalesRangeDto;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SellpiaSalesIngestSellerDto)
  sellers!: SellpiaSalesIngestSellerDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SellpiaSalesExplicitEmptyProvenanceDto)
  provenance?: SellpiaSalesExplicitEmptyProvenanceDto;

  @IsISO8601()
  capturedAt!: string;
}

export class SellpiaSalesQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}
