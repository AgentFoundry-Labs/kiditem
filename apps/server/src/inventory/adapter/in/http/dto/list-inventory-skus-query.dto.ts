import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type {
  InventorySkuStockStatus,
  SellpiaMasterActiveStatus,
} from '@kiditem/shared/inventory';
import { PaginationQueryDto } from '../../../../../common/dto';

const INVENTORY_SKU_STOCK_STATUSES = [
  'all',
  'in_stock',
  'out_of_stock',
] as const;

const SELLPIA_MASTER_ACTIVE_STATUSES = ['all', 'active', 'inactive'] as const;

export class ListInventorySkusQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  query?: string;

  @IsOptional()
  @IsIn(INVENTORY_SKU_STOCK_STATUSES)
  stockStatus?: InventorySkuStockStatus = 'all';

  @IsOptional()
  @IsIn(SELLPIA_MASTER_ACTIVE_STATUSES)
  activeStatus?: SellpiaMasterActiveStatus = 'active';
}
