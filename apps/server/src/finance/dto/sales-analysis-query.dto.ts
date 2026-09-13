import { IsOptional, IsString, Matches } from 'class-validator';
import { FINANCE_PERIOD_MESSAGE, FINANCE_PERIOD_PATTERN } from './finance-period';

export class SalesAnalysisQueryDto {
  /** `YYYY-MM`; omitted, the KST month containing the request. */
  @IsOptional()
  @IsString()
  @Matches(FINANCE_PERIOD_PATTERN, { message: FINANCE_PERIOD_MESSAGE })
  period?: string;
}
