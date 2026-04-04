import { IsUUID } from 'class-validator';

export class GeneratePickingDto {
  @IsUUID() companyId: string;
}
