import { IsString, IsBoolean, IsOptional, MinLength } from 'class-validator';

export class UpdateOptionMasterDto {
  @IsString() @MinLength(1) @IsOptional() name?: string;
  @IsString() @IsOptional() values?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
