import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ListRulesQueryDto {
  @IsUUID() @IsOptional() companyId?: string;
  @IsString() @IsOptional() category?: string;
}
