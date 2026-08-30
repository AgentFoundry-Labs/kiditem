import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../../common/dto';
import {
  PROCUREMENT_TEST_INTENT_STATUS,
  PROCUREMENT_TEST_INTENT_TYPES,
  SUPPLY_PERSISTED_INT_MAX,
  SUPPLIER_OFFER_IDENTITY_STATUSES,
  type ProcurementTestIntentStatus,
  type ProcurementTestIntentType,
  type SupplierOfferIdentityStatus,
} from '../../../../domain/policy/sourcing-procurement';

export class SupplierOfferPriceTierDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(SUPPLY_PERSISTED_INT_MAX)
  minQuantity!: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(SUPPLY_PERSISTED_INT_MAX)
  @IsOptional()
  maxQuantity?: number | null;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @IsPositive()
  unitPriceCny!: number;
}

export class CreateSupplierOfferSnapshotDto {
  @IsUUID()
  evidenceObservationId!: string;

  @IsUUID()
  @IsOptional()
  supplierId?: string | null;

  @IsString()
  @MaxLength(300)
  @IsOptional()
  supplierName?: string | null;

  @IsIn(SUPPLIER_OFFER_IDENTITY_STATUSES)
  identityStatus!: SupplierOfferIdentityStatus;

  @IsString()
  @Length(1, 60)
  sourcePlatform!: string;

  @IsUrl({ require_protocol: true })
  @IsOptional()
  sourceUrl?: string | null;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  externalSupplierKey?: string | null;

  @IsString()
  @Length(1, 200)
  externalOfferId!: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  externalSkuId?: string | null;

  @IsString()
  @MaxLength(300)
  @IsOptional()
  variantKey?: string | null;

  @IsString()
  @Length(1, 300)
  productName!: string;

  @IsString()
  @MaxLength(300)
  @IsOptional()
  variantName?: string | null;

  @Matches(/^[A-Za-z]{3}$/)
  currency!: string;

  @IsString()
  @MaxLength(60)
  @IsOptional()
  orderUnit?: string | null;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(SUPPLY_PERSISTED_INT_MAX)
  @IsOptional()
  unitsPerOrderUnit?: number | null;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(SUPPLY_PERSISTED_INT_MAX)
  @IsOptional()
  minOrderQuantity?: number | null;

  @IsBoolean()
  @IsOptional()
  sampleAvailable?: boolean | null;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @IsPositive()
  @IsOptional()
  samplePriceCny?: number | null;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @IsPositive()
  @IsOptional()
  domesticFreightCny?: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  productionLeadTimeDaysMin?: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  productionLeadTimeDaysMax?: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  dispatchLeadTimeDaysMin?: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  dispatchLeadTimeDaysMax?: number | null;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  grossWeightGrams?: number | null;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  lengthMm?: number | null;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  widthMm?: number | null;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  heightMm?: number | null;

  @IsString()
  @MaxLength(300)
  @IsOptional()
  material?: string | null;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  packCount?: number | null;

  @Type(() => Date)
  @IsDate()
  capturedAt!: Date;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  validUntil?: Date | null;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SupplierOfferPriceTierDto)
  priceTiers!: SupplierOfferPriceTierDto[];
}

export class ListSupplierOfferSnapshotsQueryDto extends PaginationQueryDto {
  @IsIn(SUPPLIER_OFFER_IDENTITY_STATUSES)
  @IsOptional()
  identityStatus?: SupplierOfferIdentityStatus;

  @IsString()
  @Length(1, 60)
  @IsOptional()
  sourcePlatform?: string;
}

export class ListProcurementTestIntentsQueryDto extends PaginationQueryDto {
  @IsIn(PROCUREMENT_TEST_INTENT_TYPES)
  @IsOptional()
  intentType?: ProcurementTestIntentType;

  @IsIn([PROCUREMENT_TEST_INTENT_STATUS])
  @IsOptional()
  status?: ProcurementTestIntentStatus;
}
