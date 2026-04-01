import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto';

export class ListInventoryQueryDto extends PaginationQueryDto {
  @IsString() @IsOptional() status?: string;
}
