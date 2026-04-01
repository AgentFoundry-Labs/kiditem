import { IsOptional, IsString } from 'class-validator';

export class SalesAnalysisQueryDto {
  @IsString() @IsOptional() period?: string;
}
