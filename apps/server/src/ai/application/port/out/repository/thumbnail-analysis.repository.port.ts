import type {
  ComplianceScores,
  ImageSpec,
  RecomposeVariantClassification,
  ThumbnailAnalysisResult,
  ThumbnailScores,
} from '@kiditem/shared/ai';

export const THUMBNAIL_ANALYSIS_REPOSITORY_PORT = Symbol(
  'THUMBNAIL_ANALYSIS_REPOSITORY_PORT',
);

export interface ThumbnailAnalysisWorkspaceRow {
  id: string;
  name: string;
  imageUrl: string;
  category: string | null;
  createdAt: Date;
}

export interface ThumbnailAnalysisRow {
  id: string;
  contentWorkspaceId: string;
  imageUrl: string;
  overallScore: number;
  grade: string;
  scores: unknown;
  issues: unknown;
  suggestions: unknown;
  method: string;
  complianceGrade: string | null;
  complianceScores: unknown;
  imageSpec: unknown;
  recompose: unknown;
  qualityAnalyzedAt: Date | null;
  complianceAnalyzedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ThumbnailAnalysisSummaryRow = Pick<
  ThumbnailAnalysisRow,
  'grade' | 'complianceGrade' | 'qualityAnalyzedAt' | 'complianceAnalyzedAt'
>;

export interface ThumbnailAnalysisSummaryRows {
  workspaceCount: number;
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
  contentWorkspaceId: string;
  organizationId: string;
  imageUrl: string;
  qualityResult?: ThumbnailAnalysisQualityFacet;
  complianceResult?: ThumbnailAnalysisComplianceFacet;
  imageSpec?: ImageSpec | null;
  recompose?: RecomposeVariantClassification;
}

export interface ThumbnailAnalysisRepositoryPort {
  findAllAnalysisWorkspaces(organizationId: string): Promise<ThumbnailAnalysisWorkspaceRow[]>;
  findAnalysesForOrganization(organizationId: string): Promise<ThumbnailAnalysisRow[]>;
  getAnalysisSummaryRows(organizationId: string): Promise<ThumbnailAnalysisSummaryRows>;
  findWorkspaceForAnalysis(
    contentWorkspaceId: string,
    organizationId: string,
  ): Promise<ThumbnailAnalysisWorkspaceRow | null>;
  findWorkspacesForBatch(
    contentWorkspaceIds: string[],
    organizationId: string,
  ): Promise<ThumbnailAnalysisWorkspaceRow[]>;
  findWorkspacesForPreInspect(
    contentWorkspaceIds: string[] | undefined,
    organizationId: string,
  ): Promise<ThumbnailAnalysisWorkspaceRow[]>;
  upsertAnalysis(input: UpsertThumbnailAnalysisInput): Promise<ThumbnailAnalysisRow>;
  findRecomposeWorkspace(
    contentWorkspaceId: string,
    organizationId: string,
  ): Promise<ThumbnailAnalysisWorkspaceRow | null>;
}
