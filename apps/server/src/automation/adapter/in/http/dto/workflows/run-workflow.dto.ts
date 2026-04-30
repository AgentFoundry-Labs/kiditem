import { IsString, IsOptional, IsObject, IsIn } from 'class-validator';

export class RunWorkflowBodyDto {
  @IsString() @IsOptional() @IsIn(['manual', 'schedule', 'cron']) triggeredBy?: string = 'manual';
  @IsObject() @IsOptional() context?: Record<string, any>;
}
