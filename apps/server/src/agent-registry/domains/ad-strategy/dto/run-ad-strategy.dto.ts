import { IsOptional, IsBoolean, IsUUID } from 'class-validator';

export class RunAdStrategyBodyDto {
  @IsUUID() @IsOptional() companyId?: string;
  @IsBoolean() @IsOptional() dryRun?: boolean;
}
