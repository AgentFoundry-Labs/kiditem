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
  allowedOrganizations?: string[];

  @IsOptional()
  metadata?: Record<string, unknown>;
}
