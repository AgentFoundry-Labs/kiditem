import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  CANCEL_OPERATION_TARGET_TYPES,
  type CancelOperationTarget,
} from '@kiditem/shared/operation-cancellation';

export class CancelOperationDto {
  @IsIn(CANCEL_OPERATION_TARGET_TYPES)
  targetType!: CancelOperationTarget['targetType'];

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  operationKey?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  runId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  requestId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  generationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export function toCancelOperationTarget(
  dto: CancelOperationDto,
): CancelOperationTarget {
  const reason = dto.reason;
  switch (dto.targetType) {
    case 'operation_key':
      if (!dto.operationKey) throw new Error('operationKey is required');
      return { targetType: 'operation_key', operationKey: dto.operationKey, reason };
    case 'workflow_run':
      if (!dto.runId) throw new Error('runId is required');
      return { targetType: 'workflow_run', runId: dto.runId, reason };
    case 'agent_run_request':
      if (!dto.requestId) throw new Error('requestId is required');
      return { targetType: 'agent_run_request', requestId: dto.requestId, reason };
    case 'agent_run':
      if (!dto.runId) throw new Error('runId is required');
      return { targetType: 'agent_run', runId: dto.runId, reason };
    case 'content_generation':
      if (!dto.generationId) throw new Error('generationId is required');
      return { targetType: 'content_generation', generationId: dto.generationId, reason };
    case 'thumbnail_generation':
      if (!dto.generationId) throw new Error('generationId is required');
      return { targetType: 'thumbnail_generation', generationId: dto.generationId, reason };
  }
}
