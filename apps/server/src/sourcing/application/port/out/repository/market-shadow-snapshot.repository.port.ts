import type { SourcingBrowserSourceAttempt } from './sourcing-browser-source-attempt.repository.port';

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
  findAttemptIdByKey(organizationId: string, idempotencyKey: string): Promise<string | null>;
  findByAttempt(organizationId: string, attemptId: string): Promise<MarketShadowSnapshotRow | null>;
  readLatest(organizationId: string): Promise<{
    latestAttempt: SourcingBrowserSourceAttempt | null;
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
