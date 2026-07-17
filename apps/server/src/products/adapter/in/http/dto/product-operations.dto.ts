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
const AD_STATUSES = ['all', 'active', 'inactive', 'unconfigured'] as const;
const PERIOD_DAYS = [7, 14, 30] as const;

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
  activeStatus: (typeof ACTIVE_STATUSES)[number] = 'all';

  @IsOptional()
  @IsIn(INVENTORY_STATUSES)
  inventoryStatus?: (typeof INVENTORY_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  abcGrade?: string;

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
}
