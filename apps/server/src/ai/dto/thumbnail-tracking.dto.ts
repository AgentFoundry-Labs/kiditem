import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ListTrackingQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateMetricsDto {
  @IsOptional()
  @IsNumber()
  ctrBefore?: number;

  @IsOptional()
  @IsNumber()
  ctrAfter?: number;

  @IsOptional()
  @IsNumber()
  reviewsBefore?: number;

  @IsOptional()
  @IsNumber()
  reviewsAfter?: number;

  @IsOptional()
  @IsNumber()
  salesBefore?: number;

  @IsOptional()
  @IsNumber()
  salesAfter?: number;

  @IsOptional()
  @IsString()
  status?: string;
}
