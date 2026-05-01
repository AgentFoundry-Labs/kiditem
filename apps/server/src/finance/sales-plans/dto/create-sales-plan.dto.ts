import { IsString, IsOptional, IsInt, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006)
 */
export class CreateSalesPlanDto {
  @IsString() @MinLength(1) period: string; // "YYYY-MM"
  @Type(() => Number) @IsInt() @IsOptional() targetRevenue?: number;
  @Type(() => Number) @IsInt() @IsOptional() targetOrders?: number;
  @Type(() => Number) @IsInt() @IsOptional() targetProfit?: number;
  @IsString() @IsOptional() notes?: string;
}
