// apps/server/src/products/dto/create-master.dto.ts
import {
  IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, IsUUID, IsUrl, Max, MaxLength, Min, ValidateIf,
} from 'class-validator';

export class CreateMasterDto {
  @IsString() @IsNotEmpty() @MaxLength(300)
  name!: string;

  @IsOptional() @IsString() @MaxLength(100)
  legacyCode?: string;

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

  @IsOptional() @IsUUID()
  supplierId?: string;

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

  @IsOptional() @IsArray() @IsUrl({}, { each: true })
  images?: string[];

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
