import { IsString, Matches } from 'class-validator';
import { FINANCE_PERIOD_MESSAGE, FINANCE_PERIOD_PATTERN } from './finance-period';

/** Reconciliation exports are always for one validated KST calendar month. */
export class SettlementExportQueryDto {
  @IsString()
  @Matches(FINANCE_PERIOD_PATTERN, { message: FINANCE_PERIOD_MESSAGE })
  period!: string;
}
