import { Transform } from 'class-transformer';
import {
  Equals,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type {
  SellpiaInventoryRefreshReason,
  SellpiaSyncScope,
} from '@kiditem/shared/sellpia-inventory-freshness';

const REFRESH_REASONS: SellpiaInventoryRefreshReason[] = [
  'initial_snapshot',
  'ttl_expired',
  'same_hash_confirmation',
  'purchase_preflight',
  'manual_request',
  'retry',
];

export class BeginSellpiaInventorySourceAttemptDto {
  @IsIn(['full', 'inventory'])
  scope!: SellpiaSyncScope;

  @IsOptional()
  @IsIn(REFRESH_REASONS)
  trigger?: SellpiaInventoryRefreshReason;
}

export class CompleteSellpiaInventorySourceAttemptDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value)
  @Equals(true)
  manualFreshExportConfirmed?: true;
}

export class FailSellpiaInventorySourceAttemptDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  errorCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  errorMessage!: string;
}
