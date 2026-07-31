import type {
  SellpiaOrderTransmissionIntentAbortResponse,
  SellpiaOrderTransmissionIntentFinalizeResponse,
  SellpiaOrderTransmissionIntentPrepareResponse,
  SellpiaOrderTransmissionIntentReconcileRequest,
  SellpiaOrderTransmissionIntentReconcileResponse,
} from '@kiditem/shared/sellpia-order-transmission';

type ActorIntent = {
  organizationId: string;
  userId: string;
  intentKey: string;
};

export interface SellpiaOrderTransmissionPort {
  prepare(input: ActorIntent): Promise<SellpiaOrderTransmissionIntentPrepareResponse>;
  finalize(input: ActorIntent): Promise<SellpiaOrderTransmissionIntentFinalizeResponse>;
  abort(input: ActorIntent): Promise<SellpiaOrderTransmissionIntentAbortResponse>;
  reconcile(
    input: ActorIntent & SellpiaOrderTransmissionIntentReconcileRequest,
  ): Promise<SellpiaOrderTransmissionIntentReconcileResponse>;
}

export const SELLPIA_ORDER_TRANSMISSION_PORT = Symbol(
  'SELLPIA_ORDER_TRANSMISSION_PORT',
);
