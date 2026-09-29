import type { SourcingServerOperationRecord } from './sourcing-server-operation.repository.port';

export const MARKET_SHADOW_SNAPSHOT_REPOSITORY_PORT = Symbol('MarketShadowSnapshotRepositoryPort');
export const MARKET_SHADOW_SNAPSHOT_SCOPE = 'market_shadow_signals' as const;
export interface MarketShadowSnapshotRow {
  id: string;
  organizationId: string;
  businessDate: Date;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
export interface MarketShadowSnapshotRepositoryPort {
  findByAttempt(organizationId: string, attemptId: string): Promise<MarketShadowSnapshotRow | null>;
  /** 최신 섀도 실행과 최신 완결 스냅숏을 한 DB 스냅숏(Repeatable Read)에서 읽는다. */
  readLatest(organizationId: string): Promise<{
    latestAttempt: SourcingServerOperationRecord | null;
    latestComplete: MarketShadowSnapshotRow | null;
    actualCutoffAt: Date | null;
  }>;
  listRecent(input: {
    organizationId: string;
    fromBusinessDate: Date;
    toBusinessDate: Date;
    limit: number;
  }): Promise<MarketShadowSnapshotRow[]>;
}
