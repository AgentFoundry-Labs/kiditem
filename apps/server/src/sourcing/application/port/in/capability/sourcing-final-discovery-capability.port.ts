import type { SourcingSourceSnapshot } from './sourcing-final-capability.port';

export const SOURCING_FINAL_DISCOVERY_CAPABILITY_PORT = Symbol('SOURCING_FINAL_DISCOVERY_CAPABILITY_PORT');

export interface SourcingFinalDiscoveryCapabilityPort {
  duplicateCheck(input: { organizationId: string; sourceUrl: string }): Promise<{ duplicate: boolean; candidateId: string | null; salesProductId: string | null }>;
  scrapeProductUrl(input: { sourceUrl: string }): Promise<SourcingSourceSnapshot>;
  ingestCandidate(input: {
    organizationId: string;
    initiatingUserId: string;
    idempotencyKey: string;
    /** Exact canonical hash of the outer { snapshot } capability input. */
    requestHash: string;
    snapshot: SourcingSourceSnapshot;
  }): Promise<{ candidateId: string; salesProductId: string | null }>;
}
