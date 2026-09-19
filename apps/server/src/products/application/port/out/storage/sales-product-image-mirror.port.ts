export const SALES_PRODUCT_IMAGE_MIRROR_PORT = Symbol('SALES_PRODUCT_IMAGE_MIRROR_PORT');

export type SalesProductImageMirrorOutcome =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/** 바깥 사진을 받아 우리 저장소에 두는 길. 받는 곳은 도메인이 고른 주소뿐이다. */
export interface SalesProductImageMirrorPort {
  /** `sourceUrl` 에서 받아 `key` 에 저장한다. 사진이 아니거나 너무 크거나 받지 못하면 저장하지 않는다. */
  mirror(input: { sourceUrl: string; key: string }): Promise<SalesProductImageMirrorOutcome>;
  /** 저장 위치의 공개 주소(받지 않고 계산만 한다). */
  urlFor(key: string): string;
}
