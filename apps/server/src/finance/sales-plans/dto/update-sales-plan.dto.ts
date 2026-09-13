import { IsString, IsOptional, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * A plan's targets and notes. Actuals are read live from collected orders and
 * are not writable.
 */
export class UpdateSalesPlanDto {
  @IsString() @IsOptional() period?: string;
  @Type(() => Number) @IsInt() @IsOptional() targetRevenue?: number;
  @Type(() => Number) @IsInt() @IsOptional() targetOrders?: number;
  @Type(() => Number) @IsInt() @IsOptional() targetProfit?: number;
  @IsString() @IsOptional() notes?: string;
}
