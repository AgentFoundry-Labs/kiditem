import { IsString, IsOptional, IsNumber, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * companyId 는 `req.authUser.companyId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006)
 */
export class CreateProductBodyDto {
  @IsString() @MinLength(1) name: string;
  @IsString() @IsOptional() category?: string;
  @Type(() => Number) @IsNumber() @IsOptional() sellPrice?: number;
  @Type(() => Number) @IsNumber() @IsOptional() commissionRate?: number;
  @Type(() => Number) @IsNumber() @IsOptional() shippingCost?: number;
  @IsString() @IsOptional() status?: string = 'active';
  @IsString() @IsOptional() abcGrade?: string = 'C';
  @IsString() @IsOptional() adTier?: string;
  @Type(() => Number) @IsNumber() @IsOptional() currentStock?: number;
  @Type(() => Number) @IsNumber() @IsOptional() leadTimeDays?: number;
}
