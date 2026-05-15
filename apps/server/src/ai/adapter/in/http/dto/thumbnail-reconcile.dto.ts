import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReconcileThumbnailBodyDto {
  /** Default: 1440. Look back this many minutes for terminal rows. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  sinceMinutes?: number;

  /** Default: 360. Fail non-terminal thumbnail jobs older than this. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(24 * 60)
  stalePendingMinutes?: number;

  /** Default: 50. Cap per call. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
