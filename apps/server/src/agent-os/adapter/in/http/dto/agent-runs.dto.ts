import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateAgentRunRequestDto {
  @IsString()
  agentType!: string;

  @IsOptional()
  @IsString()
  taskKey?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @IsString()
  sourceType!: string;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  sourceWorkflowRunId?: string;

  @IsOptional()
  @IsString()
  sourceWorkflowNodeId?: string;

  @IsOptional()
  @IsString()
  sourceResourceType?: string;

  @IsOptional()
  @IsString()
  sourceResourceId?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  triggerDetail?: string;

  @IsOptional()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  scheduledFor?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class ClaimAndRunDto {
  @IsString()
  workerId!: string;
}

export class ListRunRequestsQueryDto {
  @IsOptional()
  @IsString()
  agentInstanceId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  sourceWorkflowRunId?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ListRunsQueryDto {
  @IsOptional()
  @IsString()
  agentInstanceId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ListRunEventsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cursorSeq?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class ListCostEventsQueryDto {
  @IsOptional()
  @IsString()
  agentInstanceId?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  fromOccurredAt?: string;

  @IsOptional()
  @IsString()
  toOccurredAt?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class ListAuthorizationEventsQueryDto {
  @IsOptional()
  @IsString()
  agentInstanceId?: string;

  @IsOptional()
  @IsString()
  decision?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
