import { IsString, IsBoolean, IsOptional, MinLength } from 'class-validator';

/**
 * companyId 는 `req.authUser.companyId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006)
 */
export class CreateOptionMasterDto {
  @IsString() @MinLength(1) name: string;
  @IsString() values: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
