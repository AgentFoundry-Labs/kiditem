import { IsOptional, IsInt, Min, IsString, MaxLength } from 'class-validator';

export class UpdateInventoryMetadataDto {
  @IsOptional() @IsInt() @Min(0) safetyStock?: number;
  @IsOptional() @IsInt() @Min(0) reorderPoint?: number;
  @IsOptional() @IsInt() @Min(0) reorderQuantity?: number;
  @IsOptional() @IsInt() @Min(0) leadTimeDays?: number | null;
  @IsOptional() @IsString() @MaxLength(100) warehouseLocation?: string | null;
}
