import type {
  RegistrationTargetOptionInput,
  RegistrationTargetResolveInput,
  RegistrationTargetUpdateInput,
} from '@kiditem/shared/sales-product';

/**
 * 값이 채워진 설정 한 줄. 화면에는 이 길이 없다(KID-313) — 설정은 `resolve` 로만 생긴다. 사방넷
 * 가져오기와 테스트 준비가 몰별 값을 가진 설정을 바로 만들 때 쓴다.
 */
export interface RegistrationTargetCreateRecord extends RegistrationTargetResolveInput {
  displayName: string | null;
  registrationInput: Record<string, unknown>;
  selectedOptions: RegistrationTargetOptionInput[];
}

export const REGISTRATION_TARGET_REPOSITORY_PORT = Symbol('REGISTRATION_TARGET_REPOSITORY_PORT');
export interface RegistrationTargetRecord {
  id: string;
  salesProductId: string;
  channelAccountId: string;
  version: number;
  displayName: string | null;
  registrationInput: Record<string, unknown>;
  selectedOptions: RegistrationTargetOptionInput[];
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
  create(organizationId: string, input: RegistrationTargetCreateRecord): Promise<string>;
  /** Guard target version and validate selected options against its unchanged product/account. */
  update(organizationId: string, targetId: string, input: RegistrationTargetUpdateInput): Promise<void>;
  /** 이 몰에 더 보내지 않기로 한다. 살아 있는 실행이 있으면 거절한다. */
  archive(organizationId: string, targetId: string): Promise<void>;
}
