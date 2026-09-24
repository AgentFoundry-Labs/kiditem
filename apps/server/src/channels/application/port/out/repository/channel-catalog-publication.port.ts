import type { CoupangCatalogStage } from '@kiditem/shared/coupang-catalog-snapshot';

export interface ChannelCatalogPublicationResult {
  sourceImportRunId: string;
  duplicate: boolean;
  changes: Record<string, number>;
}

export interface ChannelCatalogPublicationPort {
  /**
   * 한 시도의 종료 트랜잭션. details 단계는 여기서만 리스팅에 상세를 반영한다 — 청크는
   * 스테이징에만 쌓인다 (KID-348).
   */
  publish(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    collectionRunId: string;
    attemptId: string;
    attemptToken: string;
    snapshotHash: string;
    chunkSetHash: string;
    stage: CoupangCatalogStage;
  }): Promise<ChannelCatalogPublicationResult>;
}

export const CHANNEL_CATALOG_PUBLICATION_PORT = Symbol('CHANNEL_CATALOG_PUBLICATION_PORT');
