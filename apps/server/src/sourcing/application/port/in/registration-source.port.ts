import type { OwnerTransaction } from '../../../../common/owner-transaction';
export const REGISTRATION_SOURCE_PORT = Symbol('REGISTRATION_SOURCE_PORT');

/**
 * Candidate eligibility remains Sourcing-owned while Channels owns the
 * registration target. KC facts are read from the selling product's own
 * certifications, not from the candidate payload (KID-310).
 */
export interface RegistrationSourcePort {
  lock(transaction: OwnerTransaction, organizationId: string, candidateId: string): Promise<void>;
  requireActive(transaction: OwnerTransaction, organizationId: string, candidateId: string): Promise<void>;
}
