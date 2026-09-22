import {
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

export class BeginSellpiaCollectionAttemptDto {
  @IsIn(['full', 'inventory'])
  scope!: SellpiaSyncScope;

  @IsOptional()
  @IsIn(COLLECTION_TRIGGERS)
  trigger?: SellpiaInventoryCollectionTrigger;
}

export class FailSellpiaCollectionAttemptDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  errorCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  errorMessage!: string;
}
