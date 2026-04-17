// apps/server/src/products/dto/list-options.query.ts
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ListOptionsQuery {
  @IsOptional() @IsUUID()
  masterId?: string;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  isBundle?: boolean;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  isDeleted?: boolean;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  isTemporary?: boolean;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @Transform(({ value }) => parseInt(value, 10)) @IsInt() @Min(1) @Max(200)
  limit?: number;

  @IsOptional() @IsString()
  cursor?: string;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  includeDeleted?: boolean;
}
