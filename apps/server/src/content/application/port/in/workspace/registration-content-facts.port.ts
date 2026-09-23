export const CONTENT_REGISTRATION_FACTS_PORT = Symbol('CONTENT_REGISTRATION_FACTS_PORT');

export type RegistrationContentIds = Readonly<{
  /** 작업공간의 현재 상세 revision. 없으면 null. */
  detailPageRevisionId: string | null;
  /** 작업공간의 현재 대표이미지 자산. 없거나 지워졌으면 null. */
  thumbnailAssetId: string | null;
}>;

/**
 * Channels 의 등록 상태 reader 가 Content 에서 읽는 유일한 것(KID-320): 판매 상품 작업공간의 두 현재 포인터.
 * 등록 뒤 상세나 대표이미지가 바뀌었는지(재전송 필요) 비교하는 데만 쓴다. 활성 작업공간이 있는 상품만 맵에
 * 있고, 상품 수와 무관한 쿼리 한 번이다.
 */
export interface ContentRegistrationFactsPort {
  readCurrentContentIds(input: {
    organizationId: string;
    salesProductIds: readonly string[];
  }): Promise<ReadonlyMap<string, RegistrationContentIds>>;
}
