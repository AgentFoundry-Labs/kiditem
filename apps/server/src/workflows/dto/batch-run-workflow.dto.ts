import { IsString, IsOptional, IsArray, ArrayMinSize, IsUUID, IsObject, IsIn } from 'class-validator';

export class BatchRunWorkflowBodyDto {
  @IsArray() @ArrayMinSize(1) @IsUUID('all', { each: true })
  workflowIds: string[];

  @IsString() @IsOptional() @IsIn(['manual', 'schedule', 'cron']) triggeredBy?: string = 'manual';
  @IsObject() @IsOptional() context?: Record<string, any>;
}
