import { IsString, IsNumber, IsOptional, IsIn } from 'class-validator';

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
  @IsIn(['tracking', 'measured', 'inconclusive'])
  status?: string;
}
