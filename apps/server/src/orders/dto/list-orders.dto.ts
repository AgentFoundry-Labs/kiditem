import { IsOptional, IsString } from 'class-validator';
import { DateRangeQueryDto } from '../../common/dto';

export class ListOrdersQueryDto extends DateRangeQueryDto {
  @IsString() @IsOptional() status?: string;
}
