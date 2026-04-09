import { IsOptional, IsBoolean, IsString, IsArray } from 'class-validator';

export class UpsertFeatureGateDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedCompanies?: string[];

  @IsOptional()
  metadata?: Record<string, unknown>;
}
