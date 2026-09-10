import { IsString, Matches } from 'class-validator';

/** Reconciliation exports are always for one validated KST calendar month. */
export class SettlementExportQueryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'period must match YYYY-MM (e.g., 2026-04)',
  })
  period!: string;
}
