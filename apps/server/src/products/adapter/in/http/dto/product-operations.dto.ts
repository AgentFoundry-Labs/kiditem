import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';

const ACTIVE_STATUSES = ['all', 'active', 'inactive'] as const;
const INVENTORY_STATUSES = [
  'sellable',
  'partial_out_of_stock',
  'out_of_stock',
  'configuration_required',
  'review_required',
] as const;
const INVENTORY_FOCUSES = [
  'attention',
  'out_of_stock',
  'imminent',
  'reorder',
] as const;
const AD_STATUSES = ['all', 'active', 'inactive', 'unconfigured'] as const;
const PERIOD_DAYS = [7, 14, 30] as const;
const ABC_STATUSES = [
  'READY',
  'INSUFFICIENT_EVIDENCE',
  'SOURCE_UNMAPPED',
  'SELLPIA_SOURCE_STALE',
  'AD_SOURCE_STALE',
] as const;

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

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

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

export class ProductRecipeComponentCandidateQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  search!: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(50)
  limit = 20;

  @IsIn(['in_stock', 'all'])
  stockStatus: 'in_stock' | 'all' = 'in_stock';
}
