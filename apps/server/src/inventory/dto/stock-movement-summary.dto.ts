import { IsInt, IsOptional, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class StockMovementSummaryQueryDto {
  @Type(() => Number)
  @IsInt() @IsPositive() @IsOptional()
  days?: number = 30;
}
