import { IsOptional, IsBoolean, IsUUID, IsObject } from 'class-validator';

export class RunAgentBodyDto {
  @IsUUID() @IsOptional() companyId?: string;
  @IsBoolean() @IsOptional() dryRun?: boolean;
  @IsObject() @IsOptional() extra?: Record<string, unknown>;
}
