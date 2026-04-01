import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto';

export class ListProductsQueryDto extends PaginationQueryDto {
  @IsString() @IsOptional() grade?: string;
  @IsString() @IsOptional() status?: string;
  @IsString() @IsOptional() search?: string;
  @IsString() @IsOptional() company?: string;
  @Type(() => Number) @IsNumber() @IsOptional() maxProfitRate?: number;
  @IsString() @IsOptional() period?: string;
  @IsString() @IsOptional() orderBy?: string;
}
