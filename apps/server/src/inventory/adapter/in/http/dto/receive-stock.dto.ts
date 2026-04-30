import { IsInt, Min, IsOptional, IsUUID, IsString, MaxLength } from 'class-validator';

export class ReceiveStockDto {
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsInt() @Min(0) unitCost?: number;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
