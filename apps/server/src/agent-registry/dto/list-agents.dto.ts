import { IsString, IsOptional, IsUUID } from 'class-validator';

export class ListAgentsQueryDto {
  @IsUUID() companyId: string;
  @IsString() @IsOptional() isActive?: string;
}
