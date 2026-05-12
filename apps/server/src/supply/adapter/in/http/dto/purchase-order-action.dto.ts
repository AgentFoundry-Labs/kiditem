import { IsString, IsOptional, IsNumber, IsUUID, IsInt, IsPositive, IsIn, IsArray, ArrayMinSize, ValidateIf, ValidateNested, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

class PurchaseOrderItemDto {
  @IsString() @MinLength(1) productName: string;
  @IsString() @IsOptional() productId?: string;
  @IsUUID() @IsOptional() optionId?: string;
  @IsInt() @IsPositive() quantity: number;
  @IsNumber() unitPriceCny: number;
}

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 */
export class PurchaseOrderActionBodyDto {
  @IsIn(['create', 'updateStatus', 'delete'])
  action: string;

  @ValidateIf(o => o.action === 'create')
  @IsString() @MinLength(1) supplierName?: string;

  @ValidateIf(o => o.action === 'create')
  @IsUUID() @IsOptional() supplierId?: string;

  @ValidateIf(o => o.action === 'create')
  @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items?: PurchaseOrderItemDto[];

  @ValidateIf(o => o.action === 'create')
  @IsString() @IsOptional() expectedDeliveryDate?: string;

  // updateStatus / delete 전용
  @ValidateIf(o => o.action === 'updateStatus' || o.action === 'delete')
  @IsUUID() id?: string;

  @ValidateIf(o => o.action === 'updateStatus')
  @IsString() status?: string;
}
