import { IsString, IsOptional } from 'class-validator';

export class AnalyzeBundleQueryDto {
  @IsString() @IsOptional() companyId?: string;
}
