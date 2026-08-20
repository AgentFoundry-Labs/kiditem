export const MARKET_SHADOW_OPERATION_PORT = Symbol('MARKET_SHADOW_OPERATION_PORT');

export interface MarketShadowOperationPort {
  startShadowCollection(input: {
    organizationId: string;
    requestedByUserId: string | null;
    triggerSource: 'domain_screen' | 'agent';
    idempotencyKey?: string | null;
  }): Promise<{ operationRunId: string; status: string }>;
}
