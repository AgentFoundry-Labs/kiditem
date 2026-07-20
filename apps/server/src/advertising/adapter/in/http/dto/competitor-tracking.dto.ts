import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class CompetitorOverviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(90)
  days?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class AutoConfigureCompetitorTrackersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  maxKeywords?: number;
}
