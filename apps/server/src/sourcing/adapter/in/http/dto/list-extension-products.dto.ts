import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class ListExtensionProductsQueryDto {
  @Type(() => Number) @IsNumber() @IsOptional() limit?: number;
  @IsString() @IsOptional() platform?: string;
}
