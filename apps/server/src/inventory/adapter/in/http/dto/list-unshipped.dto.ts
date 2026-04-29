import { IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../../../common/dto';

export class ListUnshippedQueryDto extends PaginationQueryDto {
  @Type(() => Number) @IsNumber() @IsOptional()
  minDays?: number;
}
