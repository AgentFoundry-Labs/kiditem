import type {
  CoupangCatalogBasicProductV1,
  CoupangCatalogCollectionQuality,
  CoupangCatalogDetailProductV1,
  WingCatalogDeletionConfirmationItem,
} from '@kiditem/shared/coupang-catalog-snapshot';
import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { CatalogDetailPlan } from '../../../../domain/collection/catalog-detail-targets';
import type {
  ParsedWingCatalogRow,
  ParsedWingCatalogSkippedRow,
} from '../documents/channel-document.models';

export type CatalogAccountScope = { organizationId: string; channelAccountId: string };

/** 반영한 실행과 시작한 사람. 사람이 없으면(서버 구동) `null` — 콘텐츠 작업공간의 작성자도 비어 있다. */
export type CatalogPublicationActor = CatalogAccountScope & { operationId: string; userId: string | null };

export type CatalogChanges = {
  createdProductCount: number;
  updatedProductCount: number;
  createdSkuCount: number;
  updatedSkuCount: number;
};

/**
 * Wing 카탈로그 실행 kind 셋(목록·상세·엑셀, KID-354)이 쓰는 Channels 원장 쓰기. 모두 실행 계약의 finish
 * 트랜잭션(`tx`) 안에서만 부른다 — 반영과 실행 종료가 같이 커밋된다. 실행 표는 모른다.
 */
export interface ChannelCatalogPublicationPort {
  /** 조직의 활성 쿠팡(Wing) 계정이고 벤더 신원이 있는가. 아니면 KidItem 오류로 멈춘다. */
  assertWingAccount(scope: CatalogAccountScope): Promise<void>;

  /**
   * 상세 kind scope가 저장 행과 맞는가: 대상은 모두 이 계정의 리스팅, 사라진 상품은 모두 저장돼 있고 아직
   * 삭제로 기록되지 않은 리스팅. 맞지 않는 첫 id를 돌려준다(맞으면 null).
   */
  findDetailsScopeMismatch(
    scope: CatalogAccountScope & { detailTargetProductIds: readonly string[]; absentProductIds: readonly string[] },
  ): Promise<string | null>;

  /**
   * 목록 전체를 반영하고 상세 계획을 돌려준다. 계획은 이번 목록이 쓰기 전의 저장값(`detailModifiedOn`)과
   * 비교한다. 사라진 상품은 끄지 않는다(삭제 확인은 상세 kind만).
   */
  publishList(
    tx: OwnerTransaction,
    input: CatalogPublicationActor & { products: CoupangCatalogBasicProductV1[] },
  ): Promise<{ plan: CatalogDetailPlan; changes: CatalogChanges }>;

  /**
   * 받은 상세를 반영하고 `detailModifiedOn`을 목록이 저장한 `modifiedOn`으로 올린다(같은 상세라 쓰지 않은
   * 상품도). 삭제 확인은 `deleted`만 기록한다. 상세가 오지 않은 대상은 그대로 둔다 — 다음 목록이 다시 잡는다.
   */
  publishDetails(
    tx: OwnerTransaction,
    input: CatalogPublicationActor & {
      detailTargetProductIds: readonly string[];
      absentProductIds: readonly string[];
      products: CoupangCatalogDetailProductV1[];
      confirmations: WingCatalogDeletionConfirmationItem[];
    },
  ): Promise<CoupangCatalogCollectionQuality>;

  /** [쿠팡상품정보] 엑셀 행을 자기 구역(`catalogExcel`)에 반영한다(KID-349). 목록에 없는 상품을 끄지 않는다. */
  publishWorkbook(
    tx: OwnerTransaction,
    input: CatalogAccountScope & {
      operationId: string;
      rows: ParsedWingCatalogRow[];
      skippedRows: ParsedWingCatalogSkippedRow[];
      observedAt: string;
    },
  ): Promise<CatalogChanges & { skippedRowCount: number }>;
}

export const CHANNEL_CATALOG_PUBLICATION_PORT = Symbol('CHANNEL_CATALOG_PUBLICATION_PORT');
