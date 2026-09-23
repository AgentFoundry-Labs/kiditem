import type {
  RegistrationMallInput,
  RegistrationTargetOptionInput,
  RegistrationTargetResolveInput,
  RegistrationTargetUpdateInput,
} from '@kiditem/shared/sales-product';

/**
 * 값이 채워진 설정 한 줄. 화면에는 이 길이 없다(KID-313) — 설정은 `resolve` 로만 생긴다. 사방넷
 * 가져오기와 테스트 준비가 몰별 값을 가진 설정을 바로 만들 때 쓴다. 몰 값은 저장 직전에
 * `normalizeRegistrationMallInput` 을 지난다 — 상품 사실 키는 거절된다(KID-313 W2).
 */
export interface RegistrationTargetCreateRecord extends RegistrationTargetResolveInput {
  registrationInput: RegistrationMallInput;
  selectedOptions: RegistrationTargetOptionInput[];
}

export const REGISTRATION_TARGET_REPOSITORY_PORT = Symbol('REGISTRATION_TARGET_REPOSITORY_PORT');

/**
 * 등록 대상은 선택 옵션 · 몰 전용 값 · 고른 콘텐츠 id 만 저장한다(KID-313 W2). 이름과 가격은
 * `product` 로 판매 상품에서 읽는다.
 */
export interface RegistrationTargetRecord {
  id: string;
  salesProductId: string;
  channelAccountId: string;
  version: number;
  registrationInput: RegistrationMallInput;
  selectedThumbnailAssetId: string | null;
  selectedDetailPageRevisionId: string | null;
  selectedOptions: RegistrationTargetOptionInput[];
  product: {
    name: string;
    options: { id: string; code: string | null; values: string[]; salePrice: number | null; normalPrice: number | null }[];
  };
}
export interface RegistrationTargetRepositoryPort {
  /** Under the product lock, reuse the sole active target or create one selecting every usable option. */
  resolve(organizationId: string, input: RegistrationTargetResolveInput): Promise<string>;
  list(organizationId: string, salesProductId: string): Promise<RegistrationTargetRecord[]>;
  get(organizationId: string, targetId: string): Promise<RegistrationTargetRecord | null>;
  /** Validate organization/product/account/selected-option membership and commit atomically. */
  create(organizationId: string, input: RegistrationTargetCreateRecord): Promise<string>;
  /**
   * Guard target version, validate selected options against its unchanged product/account and the
   * selected content ids against the product's own content workspace.
   */
  update(organizationId: string, targetId: string, input: RegistrationTargetUpdateInput): Promise<void>;
  /** 이 몰에 더 보내지 않기로 한다. 살아 있는 실행이 있으면 거절한다. */
  archive(organizationId: string, targetId: string): Promise<void>;
}
