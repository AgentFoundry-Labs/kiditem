import { IsString, IsOptional } from 'class-validator';

export class ListPickingQueryDto {
  @IsString() @IsOptional() companyId?: string;
}
