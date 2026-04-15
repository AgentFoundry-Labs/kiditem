import { IsString, IsBoolean, IsOptional, MinLength } from 'class-validator';

/**
 * companyId 는 `req.authUser.companyId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006)
 */
export class CreateWarehouseDto {
  @IsString() @MinLength(1) name: string;
  @IsString() @IsOptional() code?: string;
  @IsString() @IsOptional() address?: string;
  @IsString() @IsOptional() manager?: string;
  @IsString() @IsOptional() phone?: string;
  @IsBoolean() @IsOptional() isDefault?: boolean;
  @IsString() @IsOptional() status?: string;
}
