import type { OwnerTransaction } from '../../../../../common/owner-transaction';

export const CHANNEL_REGISTRABLE_DETAIL_PAGE_PORT = Symbol('CHANNEL_REGISTRABLE_DETAIL_PAGE_PORT');

/**
 * Channels 가 몰에 보낼 상세 HTML 을 읽고, 가져온 상세를 Content 에 맡기는 out-port(KID-313 W2).
 * `registrable-thumbnail.port.ts` 와 짝이다. 구현은 `channels/adapter/out/content/` 에서 Content 의
 * `RegistrationContentWorkspacePort` 를 부른다. Channels 는 상세 HTML 을 저장하지 않는다.
 */

export type RegistrableDetailHtml = Readonly<{
  revisionId: string;
  html: string;
  imageUrls: readonly string[];
}>;

export interface ChannelRegistrableDetailPagePort {
  /** 등록 대상이 고른 revision 이 있으면 그것, 없으면 워크스페이스의 현재 revision. 상세가 없으면 null. */
  read(input: {
    organizationId: string;
    salesProductId: string;
    selectedDetailPageRevisionId: string | null;
  }): Promise<RegistrableDetailHtml | null>;
  /**
   * 여러 상품의 상세를 한 번에(Content 의 일괄 읽기 하나로). 몰 시트가 쓴다 — 시트의 몰에 등록 대상이 있고
   * 그 대상이 revision 을 골랐으면 그 id 를 넘기고, 아니면 null(현재 revision). 상세 없는 상품은 map 에 없다.
   */
  readMany(input: {
    organizationId: string;
    products: ReadonlyArray<{ salesProductId: string; selectedDetailPageRevisionId: string | null }>;
  }): Promise<ReadonlyMap<string, RegistrableDetailHtml>>;
  /** 사방넷 가져오기가 상품 저장 트랜잭션 안에서 상세 원문을 `imported` revision 으로 넘긴다. */
  importFromSource(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      salesProductId: string;
      source: 'sabangnet';
      html: string;
      digest: string;
      createdByUserId: string | null;
    },
  ): Promise<{ revisionId: string | null; becameCurrent: boolean }>;
}
