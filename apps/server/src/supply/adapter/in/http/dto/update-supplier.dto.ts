import { IsString, IsOptional, IsEmail } from 'class-validator';

export class UpdateSupplierDto {
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() contactName?: string;
  @IsString() @IsOptional() phone?: string;
  @IsEmail() @IsOptional() email?: string;
  @IsString() @IsOptional() address?: string;
}
