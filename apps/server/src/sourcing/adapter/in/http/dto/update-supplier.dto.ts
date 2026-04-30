import { IsString, IsOptional, IsInt, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSupplierDto {
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() contactName?: string;
  @IsString() @IsOptional() phone?: string;
  @IsEmail() @IsOptional() email?: string;
  @IsString() @IsOptional() address?: string;
  @Type(() => Number) @IsInt() @IsOptional() leadTimeDays?: number;
  @IsString() @IsOptional() paymentTerms?: string;
  @IsString() @IsOptional() notes?: string;
  @IsString() @IsOptional() status?: string;
}
