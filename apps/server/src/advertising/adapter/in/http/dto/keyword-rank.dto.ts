import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateKeywordTrackerDto {
  @IsString()
  @IsNotEmpty()
  keyword: string;

  // 명시 추적 타깃 vendorItemId 목록. 생략/빈 배열 = 자사 카탈로그 자동매칭만.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  vendorItemIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  maxPages?: number;
}

export class UpdateKeywordTrackerDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  vendorItemIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  maxPages?: number;
}

export class KeywordRankHistoryQueryDto {
  @IsString()
  @IsNotEmpty()
  keyword: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class KeywordSerpQueryDto {
  @IsString()
  @IsNotEmpty()
  keyword: string;
}

export class KeywordProductRankQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(90)
  days?: number;
}

export class SetRepresentativeKeywordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  keyword: string;
}
