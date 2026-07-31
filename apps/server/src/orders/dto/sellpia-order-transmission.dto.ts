import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type {
  SellpiaOrderTransmissionIntentPrepareRequest,
  SellpiaOrderTransmissionIntentReconcileRequest,
} from '@kiditem/shared/sellpia-order-transmission';

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
