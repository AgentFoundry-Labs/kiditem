import type { FrozenRegistrationFacts } from '../../../../domain/registration/registration-account-state';

export const REGISTRATION_STATE_PERSISTENCE_PORT = Symbol('REGISTRATION_STATE_PERSISTENCE_PORT');

/**
 * 등록 상태 reader 가 판정에 쓰는 Channels 행 사실(KID-320). 판정은 하지 않는다 — 계정별로 등록 설정,
 * 몰이 보고한 리스팅, 등록성 실행(register · update · composition_change)의 최신 한 건과 마지막 성공이 얼린
 * 값, 가용성 실행(sold_out · resume)의 최신 한 건을 모아 줄 뿐이다. `thumbnail_update` 는 읽지 않는다.
 */
export type RegistrationStateTargetFact = Readonly<{
  id: string;
  version: number;
  selectedThumbnailAssetId: string | null;
  selectedDetailPageRevisionId: string | null;
}>;

export type RegistrationStateListingFact = Readonly<{
  id: string;
  externalId: string;
  status: string | null;
}>;

export type RegistrationStateExecutionFact = Readonly<{
  id: string;
  kind: string;
  status: string;
  providerOutcome: string;
  createdAt: Date;
  completedAt: Date | null;
}>;

export type RegistrationStateAccountFacts = Readonly<{
  channelAccountId: string;
  channel: string;
  channelAccountName: string | null;
  /** 이 계정의 활성 등록 설정. 보관된 설정은 없는 것으로 본다. */
  target: RegistrationStateTargetFact | null;
  /** 이 계정에 살아 있는(`isActive`) 리스팅 중 가장 최근 것. */
  listing: RegistrationStateListingFact | null;
  latestListingShaping: RegistrationStateExecutionFact | null;
  lastSucceededFrozen: FrozenRegistrationFacts | null;
  latestAvailability: Readonly<{ kind: string; status: string }> | null;
}>;

export type RegistrationStateProductFacts = Readonly<{
  salesProductId: string;
  productVersion: number;
  /** 활성 등록 설정이나 살아 있는 리스팅이 있는 계정만. */
  accounts: readonly RegistrationStateAccountFacts[];
}>;

export interface RegistrationStatePersistencePort {
  /** 조직의 판매 상품만 맵에 있다. 쿼리 수는 상품 수와 무관하다. */
  readFacts(organizationId: string, salesProductIds: readonly string[]): Promise<Map<string, RegistrationStateProductFacts>>;
}
