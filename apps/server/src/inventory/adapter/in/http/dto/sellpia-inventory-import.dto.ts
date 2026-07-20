import { Transform } from 'class-transformer';
import {
  Equals,
  IsIn,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';
import type { SellpiaInventoryRefreshReason } from '@kiditem/shared/sellpia-inventory-freshness';

export class SellpiaInventoryImportDto {
  @IsIn(['browser', 'manual'])
  kind!: 'browser' | 'manual';

  @ValidateIf((dto: SellpiaInventoryImportDto) => dto.kind === 'browser')
  @IsUUID('4')
  claimToken?: string;

  @ValidateIf((dto: SellpiaInventoryImportDto) => dto.kind === 'browser')
  @Matches(/^(0|[1-9]\d*)$/)
  activeGeneration?: string;

  @ValidateIf((dto: SellpiaInventoryImportDto) => dto.kind === 'browser')
  @IsIn([
    'initial_snapshot',
    'ttl_expired',
    'order_transmission_requested',
    'same_hash_confirmation',
    'purchase_preflight',
    'manual_request',
    'retry',
    'legacy_manual_import',
  ])
  trigger?: SellpiaInventoryRefreshReason;

  @ValidateIf((dto: SellpiaInventoryImportDto) => dto.kind === 'browser')
  @Equals('https://kiditem.sellpia.com')
  sourceOrigin?: 'https://kiditem.sellpia.com';

  @ValidateIf((dto: SellpiaInventoryImportDto) => dto.kind === 'browser')
  @Equals('kiditem')
  sourceAccountKey?: 'kiditem';

  @ValidateIf((dto: SellpiaInventoryImportDto) => dto.kind === 'manual')
  @Transform(({ value }) => value === 'true' ? true : value)
  @Equals(true)
  manualFreshExportConfirmed?: true;
}
