import { IsString, IsOptional, IsUUID, IsInt, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

class BundleItemDto {
  @IsUUID() productId: string;
  @Type(() => Number) @IsInt() @Min(1) quantity: number;
}

export class CreateBundleProductDto {
  @IsUUID() companyId: string;
  @IsString() name: string;
  @IsString() @IsOptional() sku?: string;
  @Type(() => Number) @IsInt() sellPrice: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => BundleItemDto) items: BundleItemDto[];
}
