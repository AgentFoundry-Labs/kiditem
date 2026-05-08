import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class ListExtensionProductsQueryDto {
  @Type(() => Number) @IsNumber() @IsOptional() page?: number;
  @Type(() => Number) @IsNumber() @IsOptional() limit?: number;
  @IsString() @IsOptional() platform?: string;
  @IsString() @IsOptional() sort?: 'newest' | 'oldest' | 'name_asc';
  @IsString() @IsOptional() inProgressOnly?: string;
}
