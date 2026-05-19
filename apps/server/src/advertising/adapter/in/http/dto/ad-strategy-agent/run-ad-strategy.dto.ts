import { IsOptional, IsBoolean } from 'class-validator';

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 */
export class RunAdStrategyBodyDto {
  @IsBoolean() @IsOptional() dryRun?: boolean;
}
