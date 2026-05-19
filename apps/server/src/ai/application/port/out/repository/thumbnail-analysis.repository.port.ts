import type {
  ComplianceScores,
  ImageSpec,
  RecomposeVariantClassification,
  ThumbnailAnalysisResult,
  ThumbnailScores,
} from '@kiditem/shared/ai';
import type { ThumbnailMasterImageRow } from '../../../../domain/thumbnail-master-image';

export const THUMBNAIL_ANALYSIS_REPOSITORY_PORT = Symbol(
  'THUMBNAIL_ANALYSIS_REPOSITORY_PORT',
);

export interface ThumbnailAnalysisMasterRow {
  id: string;
  name: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  images: ThumbnailMasterImageRow[];
  createdAt: Date;
}

export interface ThumbnailAnalysisWorkMasterRow extends ThumbnailAnalysisMasterRow {
  category: string | null;
}

export type ThumbnailAnalysisPreInspectMasterRow = Pick<
  ThumbnailAnalysisMasterRow,
  'id' | 'imageUrl' | 'thumbnailUrl' | 'images'
>;

export type ThumbnailAnalysisRecomposeMasterRow = Pick<
  ThumbnailAnalysisWorkMasterRow,
  'name' | 'category' | 'imageUrl' | 'thumbnailUrl' | 'images'
>;

export interface ThumbnailAnalysisRow {
  id: string;
  masterId: string;
  imageUrl: string | null;
  overallScore: number;
  grade: string;
  scores: unknown;
  issues: unknown;
  suggestions: unknown;
  method: string | null;
  complianceGrade: string | null;
  complianceScores: unknown;
  imageSpec: unknown;
  recompose: unknown;
  qualityAnalyzedAt: Date | null;
  complianceAnalyzedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  master?: {
    id: string;
    name: string;
    imageUrl: string | null;
    thumbnailUrl: string | null;
    images: ThumbnailMasterImageRow[];
  } | null;
}

export type ThumbnailAnalysisSummaryRow = Pick<
  ThumbnailAnalysisRow,
  'grade' | 'complianceGrade' | 'qualityAnalyzedAt' | 'complianceAnalyzedAt'
>;

export interface ThumbnailAnalysisSummaryRows {
  masterCount: number;
  rows: ThumbnailAnalysisSummaryRow[];
}

export interface ThumbnailAnalysisQualityFacet {
  overallScore: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'F';
  scores: ThumbnailScores | null;
  issues: ThumbnailAnalysisResult['issues'];
  suggestions: string[];
  method: string;
}

export interface ThumbnailAnalysisComplianceFacet {
  complianceGrade: string;
  complianceScores: ComplianceScores;
}

export interface UpsertThumbnailAnalysisInput {
  masterId: string;
  organizationId: string;
  imageUrl: string;
  qualityResult?: ThumbnailAnalysisQualityFacet;
  complianceResult?: ThumbnailAnalysisComplianceFacet;
  imageSpec?: ImageSpec | null;
  recompose?: RecomposeVariantClassification;
}

export interface ThumbnailAnalysisRepositoryPort {
  findAllAnalysisMasters(organizationId: string): Promise<ThumbnailAnalysisMasterRow[]>;
  findAnalysesForOrganization(organizationId: string): Promise<ThumbnailAnalysisRow[]>;
  getAnalysisSummaryRows(organizationId: string): Promise<ThumbnailAnalysisSummaryRows>;
  findMasterForAnalysis(
    productId: string,
    organizationId: string,
  ): Promise<ThumbnailAnalysisWorkMasterRow | null>;
  findMastersForBatch(
    productIds: string[],
    organizationId: string,
  ): Promise<ThumbnailAnalysisWorkMasterRow[]>;
  findMastersForPreInspect(
    productIds: string[] | undefined,
    organizationId: string,
  ): Promise<ThumbnailAnalysisPreInspectMasterRow[]>;
  upsertAnalysis(input: UpsertThumbnailAnalysisInput): Promise<ThumbnailAnalysisRow>;
  findRecomposeMaster(
    productId: string,
    organizationId: string,
  ): Promise<ThumbnailAnalysisRecomposeMasterRow | null>;
}
