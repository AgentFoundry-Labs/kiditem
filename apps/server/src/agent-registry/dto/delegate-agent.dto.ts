import { IsString, IsOptional, IsObject } from 'class-validator';

export class DelegateAgentBodyDto {
  @IsString()
  childAgentType: string;

  @IsString()
  companyId: string;

  @IsString()
  parentRunId: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsObject()
  @IsOptional()
  payload?: Record<string, unknown>;
}
