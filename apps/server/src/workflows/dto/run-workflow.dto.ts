import { IsString, IsOptional, IsObject } from 'class-validator';

export class RunWorkflowBodyDto {
  @IsString() @IsOptional() triggeredBy?: string = 'manual';
  @IsObject() @IsOptional() context?: Record<string, any>;
}
