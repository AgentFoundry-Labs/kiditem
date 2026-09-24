import type {
  NaverKeywordSnapshotUpsert,
  NaverPopularKeywordSnapshotUpsert,
  ShortsSnapshotUpsert,
  Sourcing1688OfferKeywordObservationInput,
  TiktokCcSnapshotUpsert,
} from './trend-collection.repository.port';
import type {
  LiveCommerceBroadcastSnapshotUpsert,
  LiveCommerceProductSnapshotUpsert,
} from './live-commerce.repository.port';
import type { AppendSourcingEvidenceObservationCommand } from './sourcing-evidence-ledger.repository.port';
import type {
  SourcingKeywordAnalysisSnapshot,
  SourcingKeywordSuggestionObservationBatch,
  SourcingWingCatalogObservation,
} from '@kiditem/shared/sourcing';
import type { MarketShadowSnapshotDocument } from '../../../../domain/market-shadow-snapshot-document';
export interface SourcingCollectionPermit {
  runId: string;
  organizationId: string;
  sourceKey: string;
  scopeKey: string;
  targetKey: string;
  leaseToken: string;
  generation: number;
  leaseExpiresAt: Date;
}

export type SourcingTypedCollectionRecord =
  | { kind: 'naver_keyword'; row: NaverKeywordSnapshotUpsert }
  | { kind: 'naver_popular_keyword'; row: NaverPopularKeywordSnapshotUpsert }
  | {
      kind: 'offer_1688_keyword_observation';
      row: Sourcing1688OfferKeywordObservationUpsert;
    }
  | { kind: 'shorts'; row: ShortsSnapshotUpsert }
  | { kind: 'tiktok_creative'; row: TiktokCcSnapshotUpsert }
  | { kind: 'live_commerce_broadcast'; row: LiveCommerceBroadcastSnapshotUpsert }
  | { kind: 'live_commerce_product'; row: LiveCommerceProductSnapshotUpsert }
  | { kind: 'wing_catalog_product'; row: SourcingWingCatalogProductFactUpsert }
  | { kind: 'keyword_suggestion_snapshot'; row: SourcingKeywordSuggestionFactUpsert }
  | { kind: 'naver_keyword_analysis_snapshot'; row: SourcingNaverKeywordAnalysisFactUpsert }
  | { kind: 'market_shadow_snapshot'; row: SourcingMarketShadowFactUpsert }
  | { kind: 'extension_source_record'; row: SourcingExtensionSourceRecordProjection };

interface EvidenceBackedSourceFact {
  organizationId: string;
  ingestionRunId: string;
  evidenceObservationKey: string;
  evidenceRevision: number;
}

export interface SourcingWingCatalogProductFactUpsert
  extends EvidenceBackedSourceFact, SourcingWingCatalogObservation {}

export interface SourcingKeywordSuggestionFactUpsert
  extends EvidenceBackedSourceFact {
  schemaVersion: string;
  keywordNormalized: string;
  document: SourcingKeywordSuggestionObservationBatch;
  capturedAt: Date;
}

export interface SourcingNaverKeywordAnalysisFactUpsert
  extends EvidenceBackedSourceFact {
  schemaVersion: string;
  inputHash: string;
  document: SourcingKeywordAnalysisSnapshot;
  capturedAt: Date;
}

export interface SourcingMarketShadowFactUpsert
  extends EvidenceBackedSourceFact {
  schemaVersion: string;
  businessDate: Date;
  document: MarketShadowSnapshotDocument;
  capturedAt: Date;
}

export interface Sourcing1688OfferKeywordObservationUpsert
  extends Sourcing1688OfferKeywordObservationInput {
  ingestionRunId: string;
  evidenceObservationKey: string;
  evidenceRevision: number;
}

/** 확장 수집 한 쪽(상세 · 설명)이 원본 기록에 싣는 사실. */
export interface SourcingExtensionSourceRecordProjection {
  organizationId: string;
  pageType: 'detail' | 'description';
  sourceUrl: string;
  sourcePlatform: string;
  externalOfferId: string;
  variantKeyNormalized: string;
  sourceIdentityHash: string;
  rawData: Record<string, unknown>;
  name: string | null;
  description: string | null;
  category: string | null;
  tags: string[];
  thumbnailUrl: string | null;
  imageUrl: string | null;
  costCny: number | null;
  triggeredByUserId: string | null;
  images: Array<{
    url: string;
    role: string;
    label: string | null;
    sortOrder: number;
    source: string;
    isPrimary: boolean;
  }>;
}

export interface AuthorizedCollectionOutput {
  observations: AppendSourcingEvidenceObservationCommand[];
  typedRecords: SourcingTypedCollectionRecord[];
  discoveredCount: number;
  rejectedCount: number;
  qualityReport: Record<string, unknown>;
}
