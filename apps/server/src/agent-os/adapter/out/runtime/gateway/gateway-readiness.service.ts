import { Injectable } from '@nestjs/common';
import {
  GatewayReadinessSchema,
  type GatewayProviderReadiness,
} from '@kiditem/shared/agent-runtime';

export interface GatewayReadinessSnapshot {
  gatewayInstanceId: string;
  readiness: GatewayProviderReadiness[];
}

/** Latest Gateway-provided availability only; it is intentionally process-local. */
@Injectable()
export class GatewayReadinessService {
  private value: GatewayReadinessSnapshot | null = null;

  update(gatewayInstanceId: string, readiness: readonly GatewayProviderReadiness[]): void {
    this.value = {
      gatewayInstanceId,
      readiness: GatewayReadinessSchema.parse(readiness).map((entry) => structuredClone(entry)),
    };
  }

  snapshot(): GatewayReadinessSnapshot | null {
    return this.value ? structuredClone(this.value) : null;
  }

  clear(gatewayInstanceId?: string): void {
    if (!gatewayInstanceId || this.value?.gatewayInstanceId === gatewayInstanceId) this.value = null;
  }
}
