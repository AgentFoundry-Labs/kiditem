import type { ChannelDelivery } from '@kiditem/shared/channel-registry';
import type { RegistrationMallInput } from '@kiditem/shared/schemas';
import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { RepresentativeImageRunnerPort } from '../automation/representative-image-runner.port';

export const CHANNEL_ADAPTER_REGISTRY_PORT = Symbol('CHANNEL_ADAPTER_REGISTRY_PORT');

/**
 * 채널 어댑터 — 몰마다 다른 것만 담는 out-port(KID-321). 실행 fence · kind · 상태 전이 · 증거 기록은
 * Channels 애플리케이션이 몰과 무관하게 하나로 하고, 이 포트는 "이 몰에서는 무엇이 다른가"만 답한다.
 * 구현은 `channels/adapter/out/channel/<key>/` 에 채널 키마다 하나(쿠팡 WING 포함), 그 밖의 몰은
 * `MALL_ADMIN_LISTING_READERS` 를 읽는 공통 어댑터 하나다. 도메인 · 애플리케이션 · shared 계약에는
 * 채널 이름이 들어가지 않는다 — 들어가면 그것이 어댑터로 옮길 대상이다.
 */

export type ProviderEvidenceDecision =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: 'missing_account' | 'account_mismatch' | 'untrusted_url' | 'invalid_listing_id' }>;

export interface ChannelAccountIdentity {
  id: string;
  channel: string;
  vendorId: string | null;
  externalAccountId: string | null;
}

export interface ConfirmationEvidenceInput {
  /** 몰이 보는 계정 식별자(쿠팡: vendorId). 확인(`confirmed`)에는 반드시 있어야 한다. */
  providerAccountId: string | null;
  /** 몰 관리자 화면 URL. 있으면 그 몰의 관리자 origin 이어야 한다. */
  observedUrl: string | null;
  externalListingId: string | null;
}

export interface PrepareAdapterPayloadInput {
  organizationId: string;
  channelAccountId: string;
  salesProductId: string;
  registrationTargetId: string;
  kind: string;
  /** 등록 대상에 저장된 몰 값. 어댑터 값은 `registrationInput.adapter[channel]`. */
  registrationInput: RegistrationMallInput;
  /** 이 제출에만 쓰는 운영자 입력(`PrepareTargetExecutionInput.adapterValues`; 쿠팡: `sellpiaInventorySkuId`). 대상에 쓰지 않는다. */
  adapterValues: Readonly<Record<string, string>>;
  /** 실행 준비가 이 실행에 붙일 기존 몰 상품. 없으면 null. */
  channelListingId: string | null;
}

export interface ChannelAdapter {
  readonly channel: string;
  /** registry `delivery` 와 같다 — 폼(확장) · API(서버) · 엑셀(운영자) · 없음. */
  readonly delivery: ChannelDelivery;
  /** 계정에서 몰이 보는 계정 식별자를 고른다. 실행 준비가 `expectedProviderAccountId` 로 얼린다. */
  providerAccountId(account: ChannelAccountIdentity): string | null;
  /** 몰 상품 id 형식. null 이면 형식 검사를 하지 않는다. */
  readonly externalListingIdPattern: RegExp | null;
  /** 확인 증거가 이 몰의 것인가 — 계정 일치 · 관리자 origin · 상품 id 형식. */
  validateConfirmationEvidence(
    account: ChannelAccountIdentity,
    expectedProviderAccountId: string | null,
    evidence: ConfirmationEvidenceInput,
  ): ProviderEvidenceDecision;
  /**
   * 실행 준비 때 payload 에 얼릴 몰 사실을 만든다(쿠팡: `wingProduct` 해석 · Sellpia 매칭 · 기존 몰
   * 상품 · vendorItemCode). 등록 대상에는 아무것도 쓰지 않는다. 얼릴 것이 없으면 `{}`. 준비 트랜잭션
   * 안에서 불린다 — 몰 사실을 읽기만 한다.
   */
  prepareAdapterPayload(transaction: OwnerTransaction, input: PrepareAdapterPayloadInput): Promise<Record<string, unknown>>;
  /** 대표이미지 반영을 지원하면 runner, 아니면 null(registry `representativeImage` 와 같아야 한다). */
  readonly representativeImage: RepresentativeImageRunnerPort | null;
}

export interface ChannelAdapterRegistryPort {
  /** 채널 키의 어댑터. 전용 어댑터가 없으면 공통 몰 어댑터를 그 키로 돌려준다. */
  get(channel: string): ChannelAdapter;
}
