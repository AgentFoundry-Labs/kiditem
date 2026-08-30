import type {
  ActiveOperationAttemptTransaction,
} from '../../../../../operations/application/port/active-browser-attempt-transaction';

export const MARKET_SHADOW_SNAPSHOT_REPOSITORY_PORT = Symbol(
  'MarketShadowSnapshotRepositoryPort',
);

export const MARKET_SHADOW_SNAPSHOT_SCOPE = 'market_shadow_signals' as const;

export interface MarketShadowSnapshotRow {
  id: string;
  organizationId: string;
  businessDate: Date;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketShadowSnapshotClaimResult {
  claimed: boolean;
  row: MarketShadowSnapshotRow;
}

export interface MarketShadowSnapshotRepositoryPort {
  claimDailyInAttempt(
    transaction: ActiveOperationAttemptTransaction,
    input: {
      organizationId: string;
      businessDate: Date;
      payload: Record<string, unknown>;
    },
  ): Promise<MarketShadowSnapshotClaimResult>;

  claimDaily(input: {
    organizationId: string;
    businessDate: Date;
    payload: Record<string, unknown>;
  }): Promise<MarketShadowSnapshotClaimResult>;

  /**
   * Releases only the exact collecting marker claimed by a fenced operation
   * that lost its attempt before it could publish a terminal snapshot.
   */
  abandonDailyClaim(input: {
    organizationId: string;
    businessDate: Date;
    snapshotId: string;
  }): Promise<0 | 1>;

  finalizeDailyInAttempt(
    transaction: ActiveOperationAttemptTransaction,
    input: {
      organizationId: string;
      businessDate: Date;
      payload: Record<string, unknown>;
    },
  ): Promise<MarketShadowSnapshotRow>;

  finalizeDaily(input: {
    organizationId: string;
    businessDate: Date;
    payload: Record<string, unknown>;
  }): Promise<MarketShadowSnapshotRow>;

  listRecent(input: {
    organizationId: string;
    fromBusinessDate: Date;
    toBusinessDate: Date;
    limit: number;
  }): Promise<MarketShadowSnapshotRow[]>;
}
