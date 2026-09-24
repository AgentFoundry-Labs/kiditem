import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { FINANCE_PERIOD_MESSAGE, FINANCE_PERIOD_PATTERN } from '../../dto/finance-period';

export const FINANCE_REPORT_TYPES = [
  'full',
  'products',
  'profitloss',
  'inventory',
  'ads',
] as const;
export type FinanceReportType = (typeof FINANCE_REPORT_TYPES)[number];

export const FINANCE_REPORT_SURFACES = ['settings', 'reports'] as const;
export type FinanceReportSurface = (typeof FINANCE_REPORT_SURFACES)[number];

/** Fixed report selection; workbook structure is server-owned. */
export class ReportExportQueryDto {
  @IsIn(FINANCE_REPORT_TYPES)
  type!: FinanceReportType;

  @IsOptional()
  @IsString()
  @Matches(FINANCE_PERIOD_PATTERN, { message: FINANCE_PERIOD_MESSAGE })
  period?: string;

  @IsOptional()
  @IsIn(FINANCE_REPORT_SURFACES)
  surface?: FinanceReportSurface;
}
