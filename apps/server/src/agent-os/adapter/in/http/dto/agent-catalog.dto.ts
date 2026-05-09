import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateAgentInstanceDto {
  @IsString()
  type!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  reportsToId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  trustLevel?: number;

  @IsOptional()
  @IsString()
  modelOverride?: string;

  @IsOptional()
  adapterConfig?: Record<string, unknown>;

  @IsOptional()
  runtimeConfig?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  promptPathOverride?: string;
}

export class UpdateAgentInstanceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  reportsToId?: string;

  @IsOptional()
  @IsIn(['active', 'paused', 'disabled'])
  lifecycleStatus?: 'active' | 'paused' | 'disabled';

  @IsOptional()
  @IsString()
  pauseReason?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  trustLevel?: number;

  @IsOptional()
  @IsString()
  modelOverride?: string;

  @IsOptional()
  adapterConfig?: Record<string, unknown>;

  @IsOptional()
  runtimeConfig?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  promptPathOverride?: string;
}

export class UpsertInstanceToolPolicyDto {
  @IsIn(['allow', 'deny', 'approval_required'])
  effect!: 'allow' | 'deny' | 'approval_required';

  @IsOptional()
  @IsIn(['none', 'admin', 'self'])
  approvalMode?: 'none' | 'admin' | 'self';

  @IsOptional()
  @IsIn(['optional', 'required', 'disabled'])
  dryRunMode?: 'optional' | 'required' | 'disabled';

  @IsOptional()
  constraints?: Record<string, unknown>;
}
