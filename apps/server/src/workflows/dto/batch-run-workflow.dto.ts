import { IsString, IsOptional, IsArray, ArrayMinSize, IsUUID, IsObject } from 'class-validator';

export class BatchRunWorkflowBodyDto {
  @IsArray() @ArrayMinSize(1) @IsUUID('all', { each: true })
  workflowIds: string[];

  @IsString() @IsOptional() triggeredBy?: string = 'manual';
  @IsObject() @IsOptional() context?: Record<string, any>;
}
