import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CampaignQueryDto {
  @IsOptional()
  @IsString()
  period?: string = '7d';

  @IsOptional()
  @IsString()
  campaign?: string;
}

export class TrendsQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number = 14;
}
