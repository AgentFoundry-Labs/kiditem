import { IsOptional, IsBoolean, IsObject } from 'class-validator';

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006)
 */
export class RunAgentBodyDto {
  @IsBoolean() @IsOptional() dryRun?: boolean;
  @IsObject() @IsOptional() extra?: Record<string, unknown>;
}
