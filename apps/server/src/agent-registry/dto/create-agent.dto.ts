import { IsString, IsOptional, IsNumber, IsBoolean, MinLength } from 'class-validator';

/**
 * companyId 는 `req.authUser.companyId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006 — Authenticated company scope)
 */
export class CreateAgentBodyDto {
  @IsString() @MinLength(1) name: string;
  @IsString() type: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @MinLength(1) promptTemplate: string;
  @IsString() @IsOptional() allowedTools?: string;
  @IsString() @IsOptional() permissionMode?: string;
  @IsNumber() @IsOptional() monthlyTokenBudget?: number;
  @IsString() @IsOptional() schedule?: string;
  @IsNumber() @IsOptional() timeoutSeconds?: number;
  @IsBoolean() @IsOptional() requiresApproval?: boolean;
}
