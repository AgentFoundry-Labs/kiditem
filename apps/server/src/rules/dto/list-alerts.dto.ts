import { IsOptional, IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class ListAlertsQueryDto {
  @Type(() => Number) @IsInt() @IsPositive() @IsOptional()
  limit?: number;
}
