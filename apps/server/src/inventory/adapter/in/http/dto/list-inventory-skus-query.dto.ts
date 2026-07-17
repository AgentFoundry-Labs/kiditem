import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type {
  InventorySkuStockStatus,
  SellpiaInventorySkuActiveStatus,
  SellpiaInventorySkuLinkStatus,
} from '@kiditem/shared/inventory';
import { PaginationQueryDto } from '../../../../../common/dto';

const INVENTORY_SKU_STOCK_STATUSES = [
  'all',
  'in_stock',
  'out_of_stock',
] as const;

const SELLPIA_INVENTORY_SKU_ACTIVE_STATUSES = ['all', 'active', 'inactive'] as const;
const SELLPIA_INVENTORY_SKU_LINK_STATUSES = ['linked', 'unlinked'] as const;

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
  @IsIn(SELLPIA_INVENTORY_SKU_ACTIVE_STATUSES)
  activeStatus?: SellpiaInventorySkuActiveStatus = 'active';

  @IsOptional()
  @IsIn(SELLPIA_INVENTORY_SKU_LINK_STATUSES)
  linkStatus?: SellpiaInventorySkuLinkStatus;
}
