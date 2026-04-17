// apps/server/src/products/dto/create-option.dto.ts
import {
  IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf,
} from 'class-validator';

export class CreateOptionDto {
  @IsUUID()
  masterId!: string;

  @IsOptional() @IsString() @MaxLength(200)
  optionName?: string;

  @IsOptional() @Matches(/^\d{13}$/, { message: 'barcode must be 13 digits (EAN13)' })
  barcode?: string;

  @IsOptional() @IsString() @MaxLength(100)
  legacyCode?: string;

  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;

  @IsOptional() @IsInt() @Min(0)
  costPrice?: number;

  @IsOptional() @IsInt() @Min(0)
  sellPrice?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  commissionRate?: number;

  @IsOptional() @IsInt() @Min(0)
  shippingCost?: number;

  @IsOptional() @IsInt() @Min(0)
  otherCost?: number;

  @IsOptional() @IsBoolean()
  isBundle?: boolean;

  @IsOptional() @IsBoolean()
  isTemporary?: boolean;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ValidateIf(o => o.isTemporary === true)
  @IsString() @IsNotEmpty()
  temporaryReason?: string;
}
