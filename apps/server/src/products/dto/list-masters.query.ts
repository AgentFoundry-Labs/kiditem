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

  @IsOptional() @IsString()
  brand?: string;

  @IsOptional() @IsIn(['A', 'B', 'C'])
  abcGrade?: 'A' | 'B' | 'C';

  @IsOptional() @IsString()
  pipelineStep?: string;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @Transform(({ value }) => parseInt(value, 10)) @IsInt() @Min(1) @Max(200)
  limit?: number;

  @IsOptional() @IsString()
  cursor?: string;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  includeDeleted?: boolean;
}
