import { IsString, IsOptional, IsInt, IsUUID, IsPositive } from 'class-validator';

export class CreateStockTransferDto {
  @IsUUID() companyId: string;
  @IsUUID() productId: string;
  @IsUUID() fromWarehouseId: string;
  @IsUUID() toWarehouseId: string;
  @IsInt() @IsPositive() quantity: number;
  @IsString() @IsOptional() notes?: string;
}
