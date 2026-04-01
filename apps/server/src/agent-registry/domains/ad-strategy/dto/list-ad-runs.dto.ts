import { IsOptional, IsNumber, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class ListAdRunsQueryDto {
  @IsUUID() @IsOptional() companyId?: string;
  @Type(() => Number) @IsNumber() @IsOptional() limit?: number;
}
