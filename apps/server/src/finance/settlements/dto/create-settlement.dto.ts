import { IsString, IsInt, IsOptional, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { FINANCE_PERIOD_MESSAGE, FINANCE_PERIOD_PATTERN } from '../../dto/finance-period';

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 */
export class CreateSettlementDto {
  /** `YYYY-MM` naming a real month. */
  @IsString() @Matches(FINANCE_PERIOD_PATTERN, { message: FINANCE_PERIOD_MESSAGE }) period: string;
  @Type(() => Number) @IsInt() expectedAmount: number;
  @Type(() => Number) @IsInt() @IsOptional() commission?: number;
  @Type(() => Number) @IsInt() @IsOptional() shippingFee?: number;
  @Type(() => Number) @IsInt() @IsOptional() orderCount?: number;
  @Type(() => Number) @IsInt() @IsOptional() returnCount?: number;
}
