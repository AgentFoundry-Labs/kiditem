import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideAgentSessionApprovalDto {
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  idempotencyKey!: string;
}

export class TaskControlDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  idempotencyKey!: string;

  @IsIn(['failed', 'paused', 'waiting_dependency'])
  expectedStatus!: 'failed' | 'paused' | 'waiting_dependency';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CancelAgentSessionTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  idempotencyKey!: string;

  @IsIn(['queued', 'running', 'waiting_dependency', 'waiting_approval', 'paused'])
  expectedStatus!: 'queued' | 'running' | 'waiting_dependency' | 'waiting_approval' | 'paused';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
