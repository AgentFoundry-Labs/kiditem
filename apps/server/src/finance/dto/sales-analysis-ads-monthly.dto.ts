import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class SalesAnalysisAdsMonthlyQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(9999)
  year!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}
