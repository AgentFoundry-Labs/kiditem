import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto';

export class ListCsQueryDto extends PaginationQueryDto {
  @IsString() @IsOptional() csStatus?: string;
}
