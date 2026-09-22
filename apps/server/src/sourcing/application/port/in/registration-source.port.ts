export const REGISTRATION_SOURCE_PORT = Symbol('REGISTRATION_SOURCE_PORT');

/** Candidate eligibility remains Sourcing-owned while Channels owns the registration target. */
export interface RegistrationSourcePort {
  lock(transaction: object, organizationId: string, candidateId: string): Promise<void>;
  requireActive(transaction: object, organizationId: string, candidateId: string): Promise<void>;
}
