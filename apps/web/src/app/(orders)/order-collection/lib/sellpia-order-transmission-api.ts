import {
  SellpiaOrderTransmissionIntentAbortResponseSchema,
  SellpiaOrderTransmissionIntentFinalizeResponseSchema,
  SellpiaOrderTransmissionIntentPrepareResponseSchema,
  SellpiaOrderTransmissionIntentReconcileResponseSchema,
} from '@kiditem/shared/sellpia-order-transmission';
import { apiClient } from '@/lib/api-client';

const INTENT_PATH = '/api/orders/sellpia-transmissions/intents';

export const sellpiaOrderTransmissionApi = {
  async prepareOrderTransmissionIntent(intentKey: string) {
    const response = await apiClient.post<unknown>(`${INTENT_PATH}/prepare`, { intentKey });
    return SellpiaOrderTransmissionIntentPrepareResponseSchema.parse(response);
  },

  async finalizeOrderTransmissionIntent(intentKey: string) {
    const response = await apiClient.post<unknown>(`${INTENT_PATH}/finalize`, { intentKey });
    return SellpiaOrderTransmissionIntentFinalizeResponseSchema.parse(response);
  },

  async abortOrderTransmissionIntent(intentKey: string) {
    const response = await apiClient.post<unknown>(`${INTENT_PATH}/abort`, { intentKey });
    return SellpiaOrderTransmissionIntentAbortResponseSchema.parse(response);
  },

  async reconcileOrderTransmissionIntent(input: {
    intentKey: string;
    outcome: 'submitted' | 'not_submitted';
    note: string;
  }) {
    const response = await apiClient.post<unknown>(`${INTENT_PATH}/reconcile`, input);
    return SellpiaOrderTransmissionIntentReconcileResponseSchema.parse(response);
  },
};
