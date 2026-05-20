import type { EditAnalysisResult } from '@kiditem/shared/ai';
import type {
  ThumbnailEditorCandidate,
  ThumbnailEditorInputImage,
} from '../../../../domain/model/thumbnail-editor';
import type { ThumbnailGenerationListScope } from '../../../../domain/thumbnail-generation-subject';
import type { ThumbnailAnalysisContext } from '../../../../domain/thumbnail-generation-inputs';

export const THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT = Symbol(
  'THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT',
);

export interface ThumbnailGenerationMasterSummary {
  id: string;
  name: string;
  imageUrl: string | null;
  category: string | null;
}

export interface ThumbnailGenerationCandidateRow {
  id: string;
  url: string;
  storageKey: string | null;
  filename: string | null;
  sortOrder: number;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  fileSize?: number | null;
}

export interface ThumbnailGenerationInputImageRow {
  url: string | null;
  role: string | null;
  label: string | null;
  sortOrder: number;
  source: string | null;
}

export interface ThumbnailGenerationRegistrationAttemptRow {
  status: string;
  errorMessage: string | null;
  finishedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
}

export interface ThumbnailGenerationLedgerRow {
  id: string;
  createdAt: Date;
  status: string;
  phase: string | null;
  grade: string;
  score: number;
  masterId: string | null;
  sourceCandidateId?: string | null;
  contentWorkspaceId?: string | null;
  method: string;
  originalUrl: string | null;
  selectedUrl: string | null;
  prompt: string | null;
  editAnalysis: unknown;
  inputMeta: unknown;
  errorMessage: string | null;
  attemptCount: number;
  triggeredByUserId: string | null;
  candidates: ThumbnailGenerationCandidateRow[];
  registrationAttempts: ThumbnailGenerationRegistrationAttemptRow[];
  master?: ThumbnailGenerationMasterSummary | null;
}

export interface ThumbnailGenerationWithCandidatesRow
  extends Omit<ThumbnailGenerationLedgerRow, 'registrationAttempts'> {
  registrationAttempts?: ThumbnailGenerationRegistrationAttemptRow[];
}

export interface ThumbnailGenerationWithInputImagesRow {
  id: string;
  masterId: string | null;
  selectedUrl: string | null;
  originalUrl: string | null;
  method: string;
  inputMeta: unknown;
  editAnalysis: unknown;
  inputImages: ThumbnailGenerationInputImageRow[];
}

export interface ThumbnailGenerationJobMasterRow {
  id: string;
  name: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  category: string | null;
  images: Array<{
    url: string;
    role: string;
    sortOrder: number;
    isPrimary: boolean;
  }>;
  thumbnailAnalyses: ThumbnailAnalysisContext[];
}

export interface ThumbnailGenerationSourceCandidateRow {
  id: string;
  name: string | null;
  category: string | null;
  images: Array<{
    id: string;
    url: string;
    storageKey: string | null;
  }>;
}

export interface ThumbnailGenerationProjectionStatus {
  id: string;
  status: string;
  phase?: string | null;
  inputMeta?: unknown;
  errorMessage: string | null;
}

export interface ThumbnailGenerationAttemptChange {
  fromStatus: string;
  fromPhase: string | null;
  attemptNumber: number;
}

export interface ThumbnailGenerationStatusChange {
  fromStatus: string;
  fromPhase: string | null;
}

export interface ThumbnailGenerationParentAlertLink {
  mode?: 'parent';
  batchId?: string;
  productGenerationBatchId?: string;
  parentOperationKey: string;
  childKind: 'detail_page' | 'thumbnail';
}

export interface SaveEditorResultInput {
  productId: string;
  organizationId: string;
  originalUrl: string | null;
  candidates: ThumbnailEditorCandidate[];
  inputImages?: ThumbnailEditorInputImage[];
  method: string;
  inputMeta?: unknown;
  editAnalysis?: EditAnalysisResult | null;
  triggeredByUserId?: string | null;
}

export interface ThumbnailGenerationLedgerRepositoryPort {
  findProductForEditor(
    productId: string,
    organizationId: string,
  ): Promise<{
    id: string;
    name: string;
    imageUrl: string | null;
    category: string | null;
    organizationId: string;
  } | null>;
  findGenerationRows(
    organizationId: string,
    opts?: {
      productId?: string | null;
      sourceCandidateId?: string | null;
      contentWorkspaceId?: string | null;
      scope?: ThumbnailGenerationListScope;
      limit?: number | null;
    },
  ): Promise<ThumbnailGenerationLedgerRow[]>;
  findGenerationOrThrow(
    id: string,
    organizationId: string,
  ): Promise<ThumbnailGenerationLedgerRow>;
  findGenerationWithCandidatesOrThrow(
    id: string,
    organizationId: string,
  ): Promise<ThumbnailGenerationWithCandidatesRow>;
  findGenerationWithInputImages(
    id: string,
    organizationId: string,
  ): Promise<ThumbnailGenerationWithInputImagesRow | null>;
  findGenerationMasters(
    rows: Array<{ masterId: string | null }>,
    organizationId: string,
  ): Promise<Map<string, ThumbnailGenerationMasterSummary>>;
  findGenerationMaster(
    masterId: string | null,
    organizationId: string,
  ): Promise<ThumbnailGenerationMasterSummary | null>;
  findJobMaster(
    masterId: string,
    organizationId: string,
  ): Promise<ThumbnailGenerationJobMasterRow | null>;
  findSourceCandidateForJob(
    sourceCandidateId: string,
    organizationId: string,
  ): Promise<ThumbnailGenerationSourceCandidateRow | null>;
  findJobMastersByIds(
    ids: string[],
    organizationId: string,
  ): Promise<Map<string, ThumbnailGenerationJobMasterRow>>;
  findActiveJobForProduct(
    masterId: string,
    organizationId: string,
    method: string,
  ): Promise<ThumbnailGenerationLedgerRow | null>;
  findRecentAutoJob(
    masterId: string,
    organizationId: string,
    cooldownStart: Date,
  ): Promise<{ id: string } | null>;
  findAutoBatchCandidates(
    organizationId: string,
    take: number,
  ): Promise<Array<{ id: string }>>;
  findThumbnailAnalysisGrade(
    masterId: string,
    organizationId: string,
  ): Promise<{ grade: string; overallScore: number } | null>;

  saveEditorResult(input: SaveEditorResultInput): Promise<string>;
  openPendingEditorJob(input: {
    organizationId: string;
    masterId: string;
    originalUrl: string;
    method: string;
    inputMeta: unknown;
    editAnalysis: EditAnalysisResult | null;
    contentWorkspaceId?: string | null;
    triggeredByUserId?: string | null;
  }): Promise<ThumbnailGenerationLedgerRow>;
  openPendingCandidateJob(input: {
    organizationId: string;
    sourceCandidateId: string;
    originalUrl: string;
    method: string;
    inputMeta: unknown;
    contentWorkspaceId?: string | null;
    triggeredByUserId?: string | null;
  }): Promise<{ id: string }>;
  openPendingStandaloneJob(input: {
    organizationId: string;
    originalUrl: string;
    method: string;
    inputMeta: unknown;
    contentWorkspaceId?: string | null;
    triggeredByUserId?: string | null;
  }): Promise<{ id: string }>;
  persistPendingInputImages(input: {
    generationId: string;
    organizationId: string;
    inputImages: ThumbnailEditorInputImage[];
  }): Promise<void>;
  setSelectedCandidate(
    id: string,
    organizationId: string,
    selectedUrl: string | null,
  ): Promise<void>;
  clearReadySelections(organizationId: string): Promise<{ count: number }>;
  applyGenerationToMaster(input: {
    id: string;
    organizationId: string;
    masterId: string;
    selected: {
      url: string;
      storageKey: string | null;
      mimeType?: string | null;
      width?: number | null;
      height?: number | null;
      fileSize?: number | null;
    } | null;
  }): Promise<void>;
  markGenerationCancelled(
    id: string,
    organizationId: string,
  ): Promise<ThumbnailGenerationStatusChange | null>;
  deleteGeneration(id: string, organizationId: string): Promise<void>;
  removeCandidate(input: {
    id: string;
    organizationId: string;
    candidateId: string;
    candidateUrl: string;
    selectedUrl: string | null;
    remainingAfterDelete: number;
  }): Promise<void>;
  resetGenerationForReEdit(input: {
    id: string;
    organizationId: string;
    purpose: 'compliance' | 'quality';
    variantKey: 'auto' | 'with-box' | 'no-box' | null;
  }): Promise<ThumbnailGenerationStatusChange | null>;
  replaceLegacyEditResult(input: {
    generationId: string;
    organizationId: string;
    candidates: ThumbnailEditorCandidate[];
    inputImages: ThumbnailEditorInputImage[];
    inputMeta: unknown;
    editAnalysis: EditAnalysisResult | null;
  }): Promise<ThumbnailGenerationAttemptChange | null>;
  markGenerationFailed(
    id: string,
    organizationId: string,
    message: string,
  ): Promise<ThumbnailGenerationAttemptChange | null>;

  claimForDirectProjection(input: {
    generationId: string;
    organizationId: string;
  }): Promise<ThumbnailGenerationAttemptChange | null>;
  projectDirectSuccess(input: {
    generationId: string;
    organizationId: string;
    candidates: ThumbnailEditorCandidate[];
    inputMeta: unknown;
  }): Promise<ThumbnailGenerationAttemptChange | null>;
  projectDirectFailure(input: {
    generationId: string;
    organizationId: string;
    errorMessage: string;
  }): Promise<ThumbnailGenerationAttemptChange | null>;
  findGenerationProjectionStatus(input: {
    organizationId: string;
    generationId: string;
  }): Promise<ThumbnailGenerationProjectionStatus | null>;
  findRecentlyTerminalGenerations(input: {
    organizationId: string;
    since: Date;
    limit: number;
  }): Promise<Array<{ id: string; status: string; errorMessage: string | null }>>;
  findStaleNonTerminalGenerations(input: {
    organizationId: string;
    staleBefore: Date;
    limit: number;
  }): Promise<Array<{ id: string }>>;
  readParentAlertLink(input: {
    organizationId: string;
    generationId: string;
  }): Promise<ThumbnailGenerationParentAlertLink | null>;
}
