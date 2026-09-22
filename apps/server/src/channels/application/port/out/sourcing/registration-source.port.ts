import type { OwnerTransaction } from '../../../../../common/owner-transaction';
export const CHANNEL_REGISTRATION_SOURCE_PORT = Symbol('CHANNEL_REGISTRATION_SOURCE_PORT');
export interface ChannelRegistrationSourcePort {
  readRegistrationBasics(transaction: OwnerTransaction, input: { organizationId: string; candidateIds: readonly string[] }): Promise<Array<{ candidateId: string; kcStatus: string | null; kcNumber: string | null }>>;
}
