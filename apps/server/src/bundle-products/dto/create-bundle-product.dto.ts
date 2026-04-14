import { IsString, IsOptional, IsUUID, IsInt, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

class BundleItemDto {
  @IsUUID() productId: string;
  @Type(() => Number) @IsInt() @Min(1) quantity: number;
}

/**
 * companyId 는 `req.authUser.companyId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006)
 */
export class CreateBundleProductDto {
  @IsString() name: string;
  @IsString() @IsOptional() sku?: string;
  @Type(() => Number) @IsInt() sellPrice: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => BundleItemDto) items: BundleItemDto[];
}
