import { IsString, IsOptional, IsEmail } from 'class-validator';

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 */
export class CreateSupplierDto {
  @IsString() name: string;
  @IsString() @IsOptional() contactName?: string;
  @IsString() @IsOptional() phone?: string;
  @IsEmail() @IsOptional() email?: string;
  @IsString() @IsOptional() address?: string;
}
