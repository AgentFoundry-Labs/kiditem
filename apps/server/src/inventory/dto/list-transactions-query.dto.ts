import { IsOptional, IsInt, Min, Max, IsUUID, IsIn, IsISO8601 } from 'class-validator';
import { Type } from 'class-transformer';
import type { StockTransactionType } from '@kiditem/shared/inventory';

export class ListTransactionsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @IsUUID() optionId?: string;
  @IsOptional() @IsIn(['RECEIVE', 'ISSUE', 'ADJUST']) type?: StockTransactionType;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}
