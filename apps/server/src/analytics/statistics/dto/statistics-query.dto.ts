import { IsString, IsOptional, IsIn } from 'class-validator';

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006)
 */
export class StatisticsQueryDto {
  @IsIn(['overview', 'products', 'categories', 'delivery', 'grades', 'pareto', 'repurchase'])
  type: string;

  @IsString() @IsOptional() period?: string; // YYYY-MM
}
