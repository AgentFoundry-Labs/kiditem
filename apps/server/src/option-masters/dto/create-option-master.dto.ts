import { IsString, IsBoolean, IsOptional, IsUUID, MinLength } from 'class-validator';

export class CreateOptionMasterDto {
  @IsUUID() companyId: string;
  @IsString() @MinLength(1) name: string;
  @IsString() values: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
