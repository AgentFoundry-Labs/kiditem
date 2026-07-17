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
  claimDaily(input: {
    organizationId: string;
    businessDate: Date;
    payload: Record<string, unknown>;
  }): Promise<MarketShadowSnapshotClaimResult>;

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
