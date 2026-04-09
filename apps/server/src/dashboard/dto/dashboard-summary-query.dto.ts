import { IsOptional, IsString } from 'class-validator';

export class DashboardSummaryQueryDto {
  @IsOptional()
  @IsString()
  range?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
