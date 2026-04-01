import { IsBoolean, IsOptional, IsObject } from 'class-validator';

export class ApproveWorkflowBodyDto {
  @IsBoolean() approved: boolean;
  @IsObject() @IsOptional() data?: Record<string, unknown>;
}
