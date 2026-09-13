import { IsString, IsOptional, IsIn, Matches } from 'class-validator';

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 */
export class StatisticsQueryDto {
  @IsIn(['overview', 'products', 'categories', 'grades', 'pareto', 'repurchase'])
  type: string;

  /** `YYYY-MM`; omitted, the window spans the observed completed orders. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'period must match YYYY-MM (e.g., 2026-04)',
  })
  period?: string;
}
