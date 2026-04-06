import { IsUUID } from 'class-validator';

export class OrgTreeQueryDto {
  @IsUUID() companyId: string;
}
