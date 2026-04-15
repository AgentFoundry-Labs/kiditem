import { IsString, IsOptional, IsInt, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * companyId 는 `req.authUser.companyId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006)
 */
export class CreateSupplierDto {
  @IsString() name: string;
  @IsString() @IsOptional() contactName?: string;
  @IsString() @IsOptional() phone?: string;
  @IsEmail() @IsOptional() email?: string;
  @IsString() @IsOptional() address?: string;
  @Type(() => Number) @IsInt() @IsOptional() leadTimeDays?: number;
  @IsString() @IsOptional() paymentTerms?: string;
  @IsString() @IsOptional() notes?: string;
}
