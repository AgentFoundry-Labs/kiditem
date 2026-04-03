import { IsString, IsOptional, IsArray, IsObject } from 'class-validator';

export class ExtensionSyncDto {
  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  campaignName?: string;

  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsArray()
  data?: any[];

  @IsOptional()
  @IsArray()
  normalizedRows?: any[];

  @IsOptional()
  @IsObject()
  kpis?: Record<string, any>;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsOptional()
  @IsArray()
  headers?: string[];

  @IsOptional()
  @IsString()
  pageType?: string;
}
