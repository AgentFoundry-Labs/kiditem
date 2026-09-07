import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';

/** `a,b,c` 또는 반복 쿼리스트링 둘 다 배열로 받는다. */
function toStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const items = raw
    .map((entry) => String(entry).trim())
    .filter((entry) => entry.length > 0);
  return items.length > 0 ? items : undefined;
}

export class MallPreflightQueryDto {
  @Transform(({ value }) => toStringArray(value))
  @IsOptional()
  @IsString({ each: true })
  mallKeys?: string[];

  @Transform(({ value }) => toStringArray(value))
  @IsOptional()
  @IsString({ each: true })
  masterProductIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @IsPositive()
  page = 1;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(100)
  limit = 25;
}

export class MallAvailabilityPreviewQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(100)
  limit = 50;
}
