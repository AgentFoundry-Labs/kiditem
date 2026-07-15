import { IsString, IsOptional, IsNumber, IsUUID, IsInt, IsPositive, IsIn, IsArray, ArrayMinSize, ArrayMaxSize, ValidateIf, ValidateNested, MinLength, MaxLength, IsUrl, IsObject, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import type {
  RocketPoCatalogRow,
  RocketPoCollectionEvidence,
} from '@kiditem/shared/rocket-purchase-preview';

class PurchaseOrderItemDto {
  @IsString() @MinLength(1) productName: string;
  @IsString() @IsOptional() productId?: string;
  @IsUUID() masterProductId: string;
  @IsInt() @IsPositive() quantity: number;
  @IsNumber() unitPriceCny: number;
}

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 */
export class PurchaseOrderActionBodyDto {
  @IsIn(['create', 'updateStatus', 'delete', 'submit', 'reconcileSubmission', 'previewRocket'])
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
  @ValidateIf(o => ['updateStatus', 'delete', 'submit', 'reconcileSubmission'].includes(o.action))
  @IsUUID() id?: string;

  @ValidateIf(o => o.action === 'updateStatus')
  @IsString() status?: string;

  @ValidateIf(o => o.action === 'submit')
  @IsString() @MinLength(1) @MaxLength(200)
  idempotencyKey?: string;

  @ValidateIf(o => o.action === 'submit')
  @IsString() @MaxLength(40) @IsOptional()
  externalOrderPlatform?: string | null;

  @ValidateIf(o => o.action === 'submit')
  @IsString() @MaxLength(120) @IsOptional()
  externalOrderId?: string | null;

  @ValidateIf(o => o.action === 'submit')
  @IsUrl() @IsOptional()
  externalOrderUrl?: string | null;

  @ValidateIf(o => o.action === 'reconcileSubmission')
  @IsIn(['provider_succeeded', 'provider_failed'])
  outcome?: 'provider_succeeded' | 'provider_failed';

  @ValidateIf(o => o.action === 'reconcileSubmission')
  @IsString() @MaxLength(120) @IsOptional()
  providerReference?: string | null;

  @ValidateIf(o => o.action === 'previewRocket')
  @IsUUID()
  channelAccountId?: string;

  @ValidateIf(o => o.action === 'previewRocket')
  @IsObject()
  collection?: RocketPoCollectionEvidence;

  @ValidateIf(o => o.action === 'previewRocket')
  @IsArray() @ArrayMaxSize(4_000)
  rows?: RocketPoCatalogRow[];

  @ValidateIf(o => o.action === 'previewRocket')
  @IsObject() @IsOptional()
  editedQuantities?: Record<string, number>;

  @ValidateIf(o => o.action === 'previewRocket')
  @IsBoolean() @IsOptional()
  clampEditedQuantities?: boolean;
}
