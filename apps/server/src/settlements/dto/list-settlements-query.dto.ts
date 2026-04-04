import { IsString, IsOptional } from 'class-validator';

export class ListSettlementsQueryDto {
  @IsString() @IsOptional() companyId?: string;
}
