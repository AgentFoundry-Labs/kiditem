import { IsString, IsOptional, IsNumber, IsUUID, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductBodyDto {
  @IsString() @MinLength(1) name: string;
  @IsUUID() companyId: string;
  @IsString() @IsOptional() category?: string;
  @Type(() => Number) @IsNumber() @IsOptional() sellPrice?: number;
  @Type(() => Number) @IsNumber() @IsOptional() commissionRate?: number;
  @Type(() => Number) @IsNumber() @IsOptional() shippingCost?: number;
  @IsString() @IsOptional() status?: string = 'active';
  @IsString() @IsOptional() abcGrade?: string = 'C';
  @IsString() @IsOptional() adTier?: string;
  @Type(() => Number) @IsNumber() @IsOptional() currentStock?: number;
  @Type(() => Number) @IsNumber() @IsOptional() leadTimeDays?: number;
}
