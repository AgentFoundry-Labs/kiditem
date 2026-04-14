import { IsOptional, IsUUID } from 'class-validator';

export class OrgTreeQueryDto {
  @IsUUID() @IsOptional() companyId?: string;
}
