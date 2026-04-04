import { IsString, IsOptional, IsInt, IsUUID, IsPositive } from 'class-validator';

export class CreateReturnTransferDto {
  @IsUUID() companyId: string;
  @IsString() @IsOptional() orderId?: string;
  @IsUUID() productId: string;
  @IsString() @IsOptional() productName?: string;
  @IsInt() @IsPositive() quantity: number;
  @IsString() @IsOptional() notes?: string;
}
