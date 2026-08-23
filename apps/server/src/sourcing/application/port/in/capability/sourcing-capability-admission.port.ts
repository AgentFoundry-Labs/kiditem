/**
 * Sourcing's narrow pre-authorization guard. It intentionally holds only
 * attempt-local scrape evidence; the AgentCapabilityInvocation row becomes
 * the durable proof after this guard admits a mutation.
 */
export const SOURCING_CAPABILITY_ADMISSION_PORT = Symbol(
  'SOURCING_CAPABILITY_ADMISSION_PORT',
);

export interface SourcingCapabilityAdmissionPort {
  admit(input: {
    capabilityKey: string;
    organizationId: string;
    initiatingUserId: string;
    attemptId: string;
    input: unknown;
  }): Promise<void>;

  recordScrapeSnapshot(input: {
    organizationId: string;
    initiatingUserId: string;
    attemptId: string;
    snapshot: unknown;
  }): void;
}
