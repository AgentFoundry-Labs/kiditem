import { IsString, IsOptional, IsInt, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { FINANCE_PERIOD_MESSAGE, FINANCE_PERIOD_PATTERN } from '../../dto/finance-period';

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 */
export class CreateSalesPlanDto {
  /** `YYYY-MM` naming a real month; a plan for no month could never read its actuals. */
  @IsString() @Matches(FINANCE_PERIOD_PATTERN, { message: FINANCE_PERIOD_MESSAGE }) period: string;
  @Type(() => Number) @IsInt() @IsOptional() targetRevenue?: number;
  @Type(() => Number) @IsInt() @IsOptional() targetOrders?: number;
  @Type(() => Number) @IsInt() @IsOptional() targetProfit?: number;
  @IsString() @IsOptional() notes?: string;
}
