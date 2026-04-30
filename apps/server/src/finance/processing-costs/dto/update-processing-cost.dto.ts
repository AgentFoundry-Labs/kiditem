import { IsString, IsOptional } from 'class-validator';

export class UpdateProcessingCostDto {
  @IsString() @IsOptional() status?: string;
  @IsString() @IsOptional() notes?: string;
}
