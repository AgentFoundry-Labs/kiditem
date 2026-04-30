import { IsOptional, IsBoolean } from 'class-validator';

/**
 * companyId 는 `req.authUser.companyId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006)
 */
export class RunAdStrategyBodyDto {
  @IsBoolean() @IsOptional() dryRun?: boolean;
}
