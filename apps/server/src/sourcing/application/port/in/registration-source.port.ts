import type { OwnerTransaction } from '../../../../common/owner-transaction';
export const REGISTRATION_SOURCE_PORT = Symbol('REGISTRATION_SOURCE_PORT');

/** Candidate eligibility remains Sourcing-owned while Channels owns the registration target. */
export interface RegistrationSourcePort {
  readRegistrationBasics(transaction: OwnerTransaction, input: { organizationId: string; candidateIds: readonly string[] }): Promise<Array<{ candidateId: string; kcStatus: string | null; kcNumber: string | null }>>;
  lock(transaction: OwnerTransaction, organizationId: string, candidateId: string): Promise<void>;
  requireActive(transaction: OwnerTransaction, organizationId: string, candidateId: string): Promise<void>;
}
