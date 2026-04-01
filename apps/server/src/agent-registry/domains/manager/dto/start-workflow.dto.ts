import { IsString, IsUUID, IsArray, IsOptional, IsObject, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class WorkflowStepDefinitionDto {
  @IsIn(['run_agent', 'approval_needed']) type: 'run_agent' | 'approval_needed';
  @IsString() @IsOptional() agentType?: string;
  @IsString() @IsOptional() message?: string;
  @IsObject() @IsOptional() payload?: Record<string, unknown>;
}

export class StartWorkflowBodyDto {
  @IsUUID() agentId: string;
  @IsUUID() companyId: string;
  @IsString() type: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => WorkflowStepDefinitionDto) steps: WorkflowStepDefinitionDto[];
  @IsObject() @IsOptional() initialInput?: Record<string, unknown>;
}
