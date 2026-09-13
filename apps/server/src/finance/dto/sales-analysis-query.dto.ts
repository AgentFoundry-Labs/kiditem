import { IsOptional, IsString, Matches } from 'class-validator';

export class SalesAnalysisQueryDto {
  /** `YYYY-MM`; omitted, the KST month containing the request. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'period must match YYYY-MM (e.g., 2026-04)',
  })
  period?: string;
}
