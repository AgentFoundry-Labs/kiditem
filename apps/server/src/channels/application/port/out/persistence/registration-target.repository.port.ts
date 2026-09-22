import type { RegistrationTargetCreateInput, RegistrationTargetResolveInput, RegistrationTargetUpdateInput } from '@kiditem/shared/sales-product';

export const REGISTRATION_TARGET_REPOSITORY_PORT = Symbol('REGISTRATION_TARGET_REPOSITORY_PORT');
export interface RegistrationTargetRecord {
  id: string;
  salesProductId: string;
  channelAccountId: string;
  version: number;
  displayName: string | null;
  registrationInput: Record<string, unknown>;
  selectedOptions: RegistrationTargetCreateInput['selectedOptions'];
  product: {
    name: string;
    options: { id: string; code: string | null; values: string[]; salePrice: number | null; normalPrice: number | null }[];
  };
}
export interface RegistrationTargetRepositoryPort {
  /** Under the product lock, reuse an unambiguous target or create one inheriting common values. */
  resolve(organizationId: string, input: RegistrationTargetResolveInput): Promise<string>;
  list(organizationId: string, salesProductId: string): Promise<RegistrationTargetRecord[]>;
  get(organizationId: string, targetId: string): Promise<RegistrationTargetRecord | null>;
  /** Validate organization/product/account/selected-option membership and commit atomically. */
  create(organizationId: string, input: RegistrationTargetCreateInput): Promise<string>;
  /** Guard target version and validate selected options against its unchanged product/account. */
  update(organizationId: string, targetId: string, input: RegistrationTargetUpdateInput): Promise<void>;
}
