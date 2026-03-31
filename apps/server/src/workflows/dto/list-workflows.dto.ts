import { IsString, IsOptional, IsUUID } from 'class-validator';

export class ListWorkflowsQueryDto {
  @IsUUID() companyId: string;
  @IsString() @IsOptional() module?: string;
  @IsString() @IsOptional() isActive?: string;
}
