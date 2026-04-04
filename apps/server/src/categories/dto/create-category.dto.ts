import { IsString, IsBoolean, IsOptional, IsUUID, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @IsUUID() companyId: string;
  @IsString() @MinLength(1) internalCategory: string;
  @IsString() @IsOptional() coupangCategoryId?: string;
  @IsString() @IsOptional() coupangCategoryName?: string;
  @IsString() @IsOptional() keywords?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
