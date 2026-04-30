import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../../../common/dto';

export class ListPurchaseOrdersQueryDto extends PaginationQueryDto {
  @IsString() @IsOptional() status?: string;
}
