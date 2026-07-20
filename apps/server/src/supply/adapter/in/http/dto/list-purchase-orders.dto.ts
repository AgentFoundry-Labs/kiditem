import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../../../common/dto';

export class ListPurchaseOrdersQueryDto extends PaginationQueryDto {
  @IsString() @IsOptional() status?: string;
  @IsString() @IsOptional() supplier?: string;
  @IsString() @IsOptional() supplierId?: string;
  @IsUUID() @IsOptional() orderId?: string;
}
