// apps/server/src/products/dto/create-master.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, IsUrl, Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { MasterImageItemDto } from './master-image-item.dto';

export class CreateMasterDto {
  @IsString() @IsNotEmpty() @MaxLength(300)
  name!: string;

  @IsOptional() @IsString() @MaxLength(100)
  legacyCode?: string;

  /** ADR-0022 — source barcode/EAN. Non-unique. Real workbook values can include
   *  whitespace + non-EAN tokens, so we only cap length and do not enforce EAN-13. */
  @IsOptional() @IsString() @MaxLength(100)
  barcode?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString()
  category?: string;

  @IsOptional() @IsString()
  brand?: string;

  @IsOptional() @IsString()
  profitTag?: string;

  @IsOptional() @IsString()
  adTier?: string;

  @IsOptional() @IsString()
  pipelineStep?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @IsOptional() @IsUrl()
  sourceUrl?: string;

  @IsOptional() @IsUrl()
  thumbnailUrl?: string;

  @IsOptional() @IsUrl()
  imageUrl?: string;

  @IsOptional() @IsUrl()
  detailPageUrl?: string;

  @IsOptional() @IsString()
  sourcePlatform?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(99999999.99)
  costCny?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  marginRate?: number;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MasterImageItemDto)
  images?: MasterImageItemDto[];

  @IsOptional() @IsIn(['A', 'B', 'C'])
  abcGrade?: 'A' | 'B' | 'C';

  @IsOptional() @IsInt() @Min(0) @Max(100)
  healthScore?: number;

  @IsOptional() @IsInt() @Min(0)
  adBudgetLimit?: number;

  @IsOptional() @IsIn(['standard', 'premium', 'custom'])
  thumbnailStrategy?: 'standard' | 'premium' | 'custom';

  @IsOptional() @IsBoolean()
  isTemporary?: boolean;

  @ValidateIf(o => o.isTemporary === true)
  @IsString() @IsNotEmpty()
  temporaryReason?: string;

  @IsOptional() @IsString()
  memo?: string;
}
