import { IsString, IsBoolean, IsOptional, MinLength } from 'class-validator';

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006)
 */
export class CreateCategoryDto {
  @IsString() @MinLength(1) internalCategory: string;
  @IsString() @IsOptional() coupangCategoryId?: string;
  @IsString() @IsOptional() coupangCategoryName?: string;
  @IsString() @IsOptional() keywords?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
