import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { CancelOperationTarget } from '../../../../application/service/operation-cancellation.types';

const TARGET_TYPES = [
  'operation_key',
  'workflow_run',
  'agent_run_request',
  'agent_run',
  'content_generation',
  'thumbnail_generation',
] as const;

export class CancelOperationDto {
  @IsIn(TARGET_TYPES)
  targetType!: CancelOperationTarget['targetType'];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  operationKey?: string;

  @IsOptional()
  @IsString()
  runId?: string;

  @IsOptional()
  @IsString()
  requestId?: string;

  @IsOptional()
  @IsString()
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
