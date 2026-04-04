import { IsString, IsOptional, IsUUID, IsInt, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProcessingCostDto {
  @IsUUID() companyId: string;
  @IsUUID() @IsOptional() productId?: string;
  @IsString() processType: string;
  @Type(() => Number) @IsInt() unitCost: number;
  @Type(() => Number) @IsInt() quantity: number;
  @IsString() @IsOptional() vendor?: string;
  @IsDateString() @IsOptional() date?: string;
  @IsString() @IsOptional() notes?: string;
}
