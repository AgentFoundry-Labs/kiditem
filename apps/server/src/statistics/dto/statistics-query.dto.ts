import { IsString, IsOptional, IsIn } from 'class-validator';

export class StatisticsQueryDto {
  @IsString() @IsOptional() companyId?: string;

  @IsIn(['overview', 'products', 'categories', 'delivery', 'grades', 'pareto', 'repurchase'])
  type: string;

  @IsString() @IsOptional() period?: string; // YYYY-MM
}
