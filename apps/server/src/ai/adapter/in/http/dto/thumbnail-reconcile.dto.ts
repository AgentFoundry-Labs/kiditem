import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReconcileThumbnailBodyDto {
  /** Default: 60. Look back this many minutes for terminal AgentRunRequests. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  sinceMinutes?: number;

  /** Default: 50. Cap per call. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
