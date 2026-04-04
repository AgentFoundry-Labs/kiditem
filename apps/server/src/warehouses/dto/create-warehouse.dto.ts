import { IsString, IsBoolean, IsOptional, IsUUID, MinLength } from 'class-validator';

export class CreateWarehouseDto {
  @IsUUID() companyId: string;
  @IsString() @MinLength(1) name: string;
  @IsString() @IsOptional() code?: string;
  @IsString() @IsOptional() address?: string;
  @IsString() @IsOptional() manager?: string;
  @IsString() @IsOptional() phone?: string;
  @IsBoolean() @IsOptional() isDefault?: boolean;
  @IsString() @IsOptional() status?: string;
}
