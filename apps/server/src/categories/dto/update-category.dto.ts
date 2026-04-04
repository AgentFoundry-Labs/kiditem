import { IsString, IsBoolean, IsOptional, MinLength } from 'class-validator';

export class UpdateCategoryDto {
  @IsString() @MinLength(1) @IsOptional() internalCategory?: string;
  @IsString() @IsOptional() coupangCategoryId?: string;
  @IsString() @IsOptional() coupangCategoryName?: string;
  @IsString() @IsOptional() keywords?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
