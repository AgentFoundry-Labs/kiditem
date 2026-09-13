import { IsString, IsOptional, IsInt, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { FINANCE_PERIOD_MESSAGE, FINANCE_PERIOD_PATTERN } from '../../dto/finance-period';

/**
 * A plan's targets and notes. Actuals are read live from collected orders and
 * are not writable.
 */
export class UpdateSalesPlanDto {
  @IsString() @IsOptional() @Matches(FINANCE_PERIOD_PATTERN, { message: FINANCE_PERIOD_MESSAGE }) period?: string;
  @Type(() => Number) @IsInt() @IsOptional() targetRevenue?: number;
  @Type(() => Number) @IsInt() @IsOptional() targetOrders?: number;
  @Type(() => Number) @IsInt() @IsOptional() targetProfit?: number;
  @IsString() @IsOptional() notes?: string;
}
