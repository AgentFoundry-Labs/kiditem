import { IsString, Matches } from 'class-validator';
import { FINANCE_PERIOD_MESSAGE, FINANCE_PERIOD_PATTERN } from '../../dto/finance-period';

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 */
export class ReconcileSettlementDto {
  /** `YYYY-MM`. */
  @IsString()
  @Matches(FINANCE_PERIOD_PATTERN, { message: FINANCE_PERIOD_MESSAGE })
  period: string;
}
