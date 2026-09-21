import { Type } from 'class-transformer';
import {
  ProductInventoryStatusSchema,
  ProductOperationsActiveStatusSchema,
  ProductOperationsAdStatusSchema,
  ProductOperationsInventoryFocusSchema,
  ProductOperationsAbcCalculationStatusFilterSchema,
} from '@kiditem/shared/product-operations';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';

const ACTIVE_STATUSES = ProductOperationsActiveStatusSchema.options;
const INVENTORY_STATUSES = ProductInventoryStatusSchema.options;
const INVENTORY_FOCUSES = ProductOperationsInventoryFocusSchema.options;
const AD_STATUSES = ProductOperationsAdStatusSchema.options;
const PERIOD_DAYS = [7, 14, 30] as const;
const ABC_STATUSES = ProductOperationsAbcCalculationStatusFilterSchema.options;

export class ProductOperationsDataStatusQueryDto {
  @Type(() => Number)
  @IsIn(PERIOD_DAYS)
  periodDays: (typeof PERIOD_DAYS)[number] = 30;
}

export class ProductOperationsListQueryDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page = 1;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(100)
  limit = 50;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;

  @Type(() => Number)
  @IsIn(PERIOD_DAYS)
  periodDays: (typeof PERIOD_DAYS)[number] = 30;

  @IsIn(ACTIVE_STATUSES)
  activeStatus: (typeof ACTIVE_STATUSES)[number] = 'active';

  @IsOptional()
  @IsIn(INVENTORY_STATUSES)
  inventoryStatus?: (typeof INVENTORY_STATUSES)[number];

  @IsOptional()
  @IsIn(INVENTORY_FOCUSES)
  inventoryFocus?: (typeof INVENTORY_FOCUSES)[number];

  @IsOptional()
  @IsIn(['A', 'B', 'C', 'unclassified'])
  abcGrade?: 'A' | 'B' | 'C' | 'unclassified';

  @IsOptional()
  @IsIn(ABC_STATUSES)
  abcCalculationStatus?: (typeof ABC_STATUSES)[number];

  @IsIn(AD_STATUSES)
  adStatus: (typeof AD_STATUSES)[number] = 'all';
}
