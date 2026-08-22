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
  @MaxLength(256)
  session?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  task?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  idempotencyKey?: string;

  @IsOptional()
  @IsIn(['queued', 'running', 'waiting_dependency', 'waiting_approval', 'paused'])
  expectedStatus?: 'queued' | 'running' | 'waiting_dependency' | 'waiting_approval' | 'paused';

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
    case 'agent_session_task':
      if (!dto.session) throw new Error('session is required');
      if (!dto.task) throw new Error('task is required');
      if (!dto.idempotencyKey) throw new Error('idempotencyKey is required');
      if (!dto.expectedStatus) throw new Error('expectedStatus is required');
      return {
        targetType: 'agent_session_task',
        session: dto.session as never,
        task: dto.task as never,
        idempotencyKey: dto.idempotencyKey,
        expectedStatus: dto.expectedStatus,
        reason,
      };
    case 'content_generation':
      if (!dto.generationId) throw new Error('generationId is required');
      return { targetType: 'content_generation', generationId: dto.generationId, reason };
    case 'thumbnail_generation':
      if (!dto.generationId) throw new Error('generationId is required');
      return { targetType: 'thumbnail_generation', generationId: dto.generationId, reason };
  }
}
