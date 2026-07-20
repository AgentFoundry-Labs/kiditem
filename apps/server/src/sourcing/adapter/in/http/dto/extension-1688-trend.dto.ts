import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const INT4_MAX = 2_147_483_647;

export class Extension1688TrendItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(/\S/)
  offerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(1_000_000_000)
  priceCny?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  monthlySales?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  repurchaseRate?: string;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(1_000_000)
  tradeScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplierName?: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2_048)
  imageUrl?: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2_048)
  sourceUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  rank?: number;
}

export class Extension1688TrendKeywordResultDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/\S/)
  keyword!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => Extension1688TrendItemDto)
  items!: Extension1688TrendItemDto[];
}

export class Extension1688TrendErrorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/\S/)
  keyword!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1_000)
  @Matches(/\S/)
  message!: string;
}

export class IngestExtension1688TrendResultsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(/\S/)
  runId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => Extension1688TrendKeywordResultDto)
  keywords!: Extension1688TrendKeywordResultDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => Extension1688TrendErrorDto)
  errors?: Extension1688TrendErrorDto[];
}
