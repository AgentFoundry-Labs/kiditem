import { IsOptional, IsBoolean, IsNumber, IsUUID } from 'class-validator';

export class RunAdStrategyBodyDto {
  @IsUUID() @IsOptional() companyId?: string;
  @IsBoolean() @IsOptional() dryRun?: boolean;
  @IsNumber() @IsOptional() dailyBudgetLimit?: number;
}
