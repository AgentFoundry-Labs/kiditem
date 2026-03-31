import { IsOptional, IsUUID } from 'class-validator';

export class EvaluateRulesQueryDto {
  @IsUUID() @IsOptional() companyId?: string;
}
