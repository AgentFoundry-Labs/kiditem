export const CHANNEL_REGISTRABLE_CONTENT_FACTS_PORT = Symbol('CHANNEL_REGISTRABLE_CONTENT_FACTS_PORT');

/**
 * 등록 상태 reader 가 "재전송 필요"를 판정할 때 쓰는 지금 콘텐츠(KID-320) — 판매 상품 작업공간의 현재 상세
 * revision id 와 현재 대표이미지 자산 id. Content 가 소유하고, 등록 대상이 고른 값이 있으면 호출자가 그것을 먼저 쓴다.
 */
export type RegistrableContentIds = Readonly<{
  detailPageRevisionId: string | null;
  thumbnailAssetId: string | null;
}>;

export interface ChannelRegistrableContentFactsPort {
  /** 작업공간이 있는 상품만 맵에 있다. 한 번에 읽는다. */
  readCurrentContentIds(input: {
    organizationId: string;
    salesProductIds: readonly string[];
  }): Promise<ReadonlyMap<string, RegistrableContentIds>>;
}
