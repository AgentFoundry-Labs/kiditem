import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AD_ACTION_TARGET_TYPES } from '../services/types';

export class AdActionQueryDto {
  @IsOptional()
  @IsString()
  approvalStatus?: string;

  @IsOptional()
  @IsString()
  executeStatus?: string;

  @IsOptional()
  @IsUUID()
  listingId?: string;

  @IsOptional()
  @IsUUID()
  optionId?: string;

  @IsOptional()
  @IsIn([...AD_ACTION_TARGET_TYPES])
  targetType?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class AdActionCommandDto {
  @IsString()
  @IsIn(['generate', 'approve', 'reject', 'markRunning', 'markDone', 'markFailed', 'resetFailed'])
  action: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];

  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  beforeJson?: Record<string, unknown>;

  @IsOptional()
  afterJson?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}
