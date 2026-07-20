import { Equals, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type {
  SellpiaInventoryCollectionFailureCode,
  SellpiaInventoryRefreshRequest,
  SellpiaOrderTransmissionIntentPrepareRequest,
  SellpiaOrderTransmissionIntentReconcileRequest,
} from '@kiditem/shared/sellpia-inventory-freshness';

export class SellpiaInventoryRefreshRequestDto
implements SellpiaInventoryRefreshRequest {
  @IsIn(['order_transmission_requested', 'manual_request', 'retry'])
  reason!: SellpiaInventoryRefreshRequest['reason'];
}

export class SellpiaInventoryClaimRequestDto {}
export class SellpiaInventoryHeartbeatRequestDto {}
export class SellpiaInventoryCancelRequestDto {}

export class SellpiaOrderTransmissionIntentRequestDto
implements SellpiaOrderTransmissionIntentPrepareRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  intentKey!: string;
}

export class SellpiaOrderTransmissionIntentReconcileRequestDto
implements SellpiaOrderTransmissionIntentReconcileRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  intentKey!: string;

  @IsIn(['submitted', 'not_submitted'])
  outcome!: SellpiaOrderTransmissionIntentReconcileRequest['outcome'];

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  note!: string;
}

export class SellpiaInventoryFailRequestDto {
  @IsIn([
    'sellpia_login_required',
    'sellpia_download_contract_drift',
    'sellpia_invalid_workbook',
    'sellpia_background_timeout',
    'sellpia_network_failed',
  ])
  errorCode!: SellpiaInventoryCollectionFailureCode;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  errorMessage!: string;
}

export class SellpiaInventorySourceBindingRequestDto {
  @Equals('https://kiditem.sellpia.com')
  sourceOrigin!: 'https://kiditem.sellpia.com';

  @Equals('kiditem')
  sourceAccountKey!: 'kiditem';

  @Equals(true)
  confirmed!: true;
}
