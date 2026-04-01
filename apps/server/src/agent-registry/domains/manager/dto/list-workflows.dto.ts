import { IsOptional, IsNumber, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class ListWorkflowsQueryDto {
  @IsUUID() companyId: string;
  @Type(() => Number) @IsNumber() @IsOptional() limit?: number;
}
