/**
 * Sourcing's narrow pre-admission guard. It retains only one bounded,
 * normalized scrape receipt for the current active turn context.
 */
export const SOURCING_CAPABILITY_ADMISSION_PORT = Symbol(
  'SOURCING_CAPABILITY_ADMISSION_PORT',
);

export interface SourcingCapabilityAdmissionPort {
  admit(input: {
    capabilityKey: string;
    organizationId: string;
    initiatingUserId: string;
    executionId: string;
    input: unknown;
  }): Promise<{ canonicalInput: unknown }>;

  recordScrapeSnapshot(input: {
    organizationId: string;
    initiatingUserId: string;
    executionId: string;
    snapshot: unknown;
  }): void;

  /** Called by the live-binding owner on turn end, revocation, or disconnect. */
  revokeExecution(input: {
    organizationId: string;
    initiatingUserId: string;
    executionId: string;
  }): void;
}
