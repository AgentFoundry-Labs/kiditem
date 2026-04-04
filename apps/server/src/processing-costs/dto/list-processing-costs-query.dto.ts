import { IsString, IsOptional } from 'class-validator';

export class ListProcessingCostsQueryDto {
  @IsString() @IsOptional() companyId?: string;
  @IsString() @IsOptional() status?: string;
}
