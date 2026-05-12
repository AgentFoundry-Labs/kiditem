// apps/server/src/products/dto/list-masters.query.ts
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListMastersQuery {
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  isDeleted?: boolean;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  isTemporary?: boolean;

  @IsOptional() @IsString()
  category?: string;

  @IsOptional() @IsIn(['season', 'stationery', 'toy', 'bag', 'music-art-sports', 'learning', 'fancy', 'craft', 'kindergarten', 'snack'])
  categoryGroup?: 'season' | 'stationery' | 'toy' | 'bag' | 'music-art-sports' | 'learning' | 'fancy' | 'craft' | 'kindergarten' | 'snack';

  @IsOptional() @IsString()
  brand?: string;

  @IsOptional() @IsIn(['A', 'B', 'C'])
  abcGrade?: 'A' | 'B' | 'C';

  @IsOptional() @IsIn(['A', 'B', 'C', 'minus', 'low'])
  grade?: 'A' | 'B' | 'C' | 'minus' | 'low';

  @IsOptional() @IsIn(['active', 'inactive', 'cleanup', 'unknown'])
  status?: 'active' | 'inactive' | 'cleanup' | 'unknown';

  @IsOptional() @IsIn(['ad', 'noad'])
  ad?: 'ad' | 'noad';

  @IsOptional() @IsIn(['risk', 'zero', 'ok'])
  stock?: 'risk' | 'zero' | 'ok';

  // Phase 5 (#192): API surface for master lifecycle. Replaces the legacy
  // `pipelineStep` filter. Allowed values mirror PRODUCT_LIFECYCLE_STATES.
  @IsOptional() @IsIn(['active', 'paused', 'discontinued'])
  lifecycleState?: 'active' | 'paused' | 'discontinued';

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @Transform(({ value }) => parseInt(value, 10)) @IsInt() @Min(1) @Max(10000)
  limit?: number;

  @IsOptional() @Transform(({ value }) => parseInt(value, 10)) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Transform(({ value }) => parseInt(value, 10)) @IsInt() @IsIn([7, 14, 30, 365])
  period?: 7 | 14 | 30 | 365;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  enriched?: boolean;

  @IsOptional() @IsString()
  cursor?: string;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  includeDeleted?: boolean;
}
