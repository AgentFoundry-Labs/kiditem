import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { InventorySkuStockStatus } from '@kiditem/shared/inventory';
import { PaginationQueryDto } from '../../../../../common/dto';

const INVENTORY_SKU_STOCK_STATUSES = [
  'all',
  'in_stock',
  'out_of_stock',
] as const;

export class ListInventorySkusQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  query?: string;

  @IsOptional()
  @IsIn(INVENTORY_SKU_STOCK_STATUSES)
  stockStatus?: InventorySkuStockStatus = 'all';
}
