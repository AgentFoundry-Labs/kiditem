import { IsString, IsOptional, IsUUID, IsInt, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSupplierDto {
  @IsUUID() companyId: string;
  @IsString() name: string;
  @IsString() @IsOptional() contactName?: string;
  @IsString() @IsOptional() phone?: string;
  @IsEmail() @IsOptional() email?: string;
  @IsString() @IsOptional() address?: string;
  @Type(() => Number) @IsInt() @IsOptional() leadTimeDays?: number;
  @IsString() @IsOptional() paymentTerms?: string;
  @IsString() @IsOptional() notes?: string;
}
