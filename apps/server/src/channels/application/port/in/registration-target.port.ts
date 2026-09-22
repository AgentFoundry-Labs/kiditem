import type { RegistrationTarget, RegistrationTargetCreateInput, RegistrationTargetResolveInput, RegistrationTargetUpdateInput } from '@kiditem/shared/sales-product';

export const REGISTRATION_TARGET_PORT = Symbol('REGISTRATION_TARGET_PORT');
export interface RegistrationTargetPort {
  resolve(organizationId: string, input: RegistrationTargetResolveInput): Promise<RegistrationTarget>;
  list(organizationId: string, salesProductId: string): Promise<RegistrationTarget[]>;
  get(organizationId: string, targetId: string): Promise<RegistrationTarget>;
  create(organizationId: string, input: RegistrationTargetCreateInput): Promise<RegistrationTarget>;
  update(organizationId: string, targetId: string, input: RegistrationTargetUpdateInput): Promise<RegistrationTarget>;
  /**
   * 이 몰에 더 보내지 않기로 한다(보관).
   *
   * 준비 · 실행 중인 제출이 있으면 거절한다 — 나간 제출의 근거가 되는 설정을 치우면 그 결과를
   * 어디에 이어 붙일지 알 수 없다. 보관해도 지난 실행 이력은 그대로 남는다.
   */
  archive(organizationId: string, targetId: string): Promise<void>;
}
