import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ReconcileBrowserOperationAlertsDto {
  @Type(() => Number) @IsInt() @Min(5) @Max(24 * 60) @IsOptional()
  staleMinutes?: number;

  @Type(() => Number) @IsInt() @Min(1) @Max(500) @IsOptional()
  limit?: number;
}
