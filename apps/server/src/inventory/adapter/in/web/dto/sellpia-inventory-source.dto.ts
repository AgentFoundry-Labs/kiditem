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
  SellpiaInventoryCollectionTrigger,
  SellpiaSyncScope,
} from '@kiditem/shared/sellpia-inventory-freshness';

const COLLECTION_TRIGGERS: SellpiaInventoryCollectionTrigger[] = [
  'initial_snapshot',
  'manual_request',
  'retry',
];

export class BeginSellpiaInventorySourceAttemptDto {
  @IsIn(['full', 'inventory'])
  scope!: SellpiaSyncScope;

  @IsOptional()
  @IsIn(COLLECTION_TRIGGERS)
  trigger?: SellpiaInventoryCollectionTrigger;
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
