import { IsOptional, IsInt, Min, Max, IsIn, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import type { InventoryStatus } from '@kiditem/shared/inventory';

export class ListInventoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsIn(['healthy', 'low', 'out'])
  status?: InventoryStatus;

  @IsOptional()
  @IsUUID()
  optionId?: string;

  @IsOptional()
  @IsUUID()
  masterId?: string;
}
