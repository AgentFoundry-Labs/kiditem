import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  AD_ACTION_COMMAND_MAX_IDS,
  AdActionExpectedApprovalStatusSchema,
  type AdActionExpectedApprovalStatus,
} from '@kiditem/shared/advertising';
import { AD_ACTION_TARGET_TYPES } from '../../../../domain/model/strategy-types';

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
  @Max(AD_ACTION_COMMAND_MAX_IDS)
  limit?: number;
}

export class AdActionCommandDto {
  @IsString()
  @IsIn(['generate', 'approve', 'reject', 'markRunning', 'markDone', 'markFailed'])
  action: string;

  /** Actions to approve or reject, at most the action listing's page size. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(AD_ACTION_COMMAND_MAX_IDS)
  @IsUUID(undefined, { each: true })
  ids?: string[];

  /**
   * The review each named action must still be in for an approve or reject to
   * change it; the others are skipped. Absent, every named action changes.
   */
  @IsOptional()
  @IsIn(AdActionExpectedApprovalStatusSchema.options)
  expectedApprovalStatus?: AdActionExpectedApprovalStatus;

  /** The action an execution report is for. */
  @IsOptional()
  @IsUUID()
  id?: string;

  /** The attempt an execution report is for: the action listing's `executionTaskId`. */
  @IsOptional()
  @IsUUID()
  executionTaskId?: string;

  @IsOptional()
  beforeJson?: Record<string, unknown>;

  @IsOptional()
  afterJson?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}
