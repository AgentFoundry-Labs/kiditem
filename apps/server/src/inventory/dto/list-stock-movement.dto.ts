import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto';

export class ListStockMovementQueryDto extends PaginationQueryDto {
  @IsString() @IsOptional() type?: string;
  @IsString() @IsOptional() from?: string;
  @IsString() @IsOptional() groupBy?: string;
}
