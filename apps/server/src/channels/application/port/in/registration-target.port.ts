import type { RegistrationTarget, RegistrationTargetCreateInput, RegistrationTargetResolveInput, RegistrationTargetUpdateInput } from '@kiditem/shared/sales-product';

export const REGISTRATION_TARGET_PORT = Symbol('REGISTRATION_TARGET_PORT');
export interface RegistrationTargetPort {
  resolve(organizationId: string, input: RegistrationTargetResolveInput): Promise<RegistrationTarget>;
  list(organizationId: string, salesProductId: string): Promise<RegistrationTarget[]>;
  get(organizationId: string, targetId: string): Promise<RegistrationTarget>;
  create(organizationId: string, input: RegistrationTargetCreateInput): Promise<RegistrationTarget>;
  update(organizationId: string, targetId: string, input: RegistrationTargetUpdateInput): Promise<RegistrationTarget>;
}
