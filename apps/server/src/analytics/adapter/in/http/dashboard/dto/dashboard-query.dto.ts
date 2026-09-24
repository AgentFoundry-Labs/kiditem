import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class DashboardQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['day', 'week', 'month', 'custom'])
  range?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be ISO date YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be ISO date YYYY-MM-DD' })
  to?: string;
}

export class DashboardTrendQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['day', 'week', 'month', 'custom'])
  range?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
