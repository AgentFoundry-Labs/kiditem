import { IsOptional, IsString } from 'class-validator';
import { DateRangeQueryDto } from '../../common/dto';

export class ListReturnsQueryDto extends DateRangeQueryDto {
  @IsString() @IsOptional() type?: string;
}
