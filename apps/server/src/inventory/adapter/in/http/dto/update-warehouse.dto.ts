import { IsString, IsBoolean, IsOptional, MinLength } from 'class-validator';

export class UpdateWarehouseDto {
  @IsString() @MinLength(1) @IsOptional() name?: string;
  @IsString() @IsOptional() code?: string;
  @IsString() @IsOptional() address?: string;
  @IsString() @IsOptional() manager?: string;
  @IsString() @IsOptional() phone?: string;
  @IsBoolean() @IsOptional() isDefault?: boolean;
  @IsString() @IsOptional() status?: string;
}
