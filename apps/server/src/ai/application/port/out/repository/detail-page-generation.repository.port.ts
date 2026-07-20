import type { DetailPageGenerationSnapshot } from './detail-page-query.repository.port';
import type {
  DetailPageRawInput,
  DetailPageSourceReference,
  DetailPageTemplateId,
} from '../../../service/detail-page-ai.types';
import type { CreateAiDirectJobInput } from './ai-direct-job.repository.port';

export const DETAIL_PAGE_GENERATION_REPOSITORY_PORT = Symbol(
  'DETAIL_PAGE_GENERATION_REPOSITORY_PORT',
);

export interface DetailPageContentWorkspaceSnapshot {
  id: string;
  sourceCandidateId: string | null;
  displayName: string;
  normalizedTitle: string;
}

export interface DetailPageSourceCandidateSnapshot {
  id: string;
  name: string;
}

export interface DetailPageSourceContentGenerationSnapshot {
  id: string;
  generatedTitle: string | null;
}

export interface DetailPageSourceContentAssetSnapshot {
  id: string;
  label: string | null;
  role: string | null;
}

export interface DetailPageImageOnlyBaseCandidateSnapshot {
  id: string;
  generationInput: unknown;
  generationResult: unknown;
  templateId: string | null;
  generatedTitle: string | null;
}

export interface DetailPageRerunBaseSnapshot {
  id: string;
  generationGroupId: string;
  contentWorkspaceId: string;
  sourceCandidateId: string | null;
  generationInput: unknown;
  generationResult: unknown;
  templateId: string | null;
  generatedTitle: string | null;
}

export interface DetailPageCancellableGenerationSnapshot {
  id: string;
  status: string;
  generationInput: unknown;
  generationResult: unknown;
}

export type DetailPageOpenProcessingGenerationLedgerResult = {
  status: 'created';
  row: DetailPageGenerationSnapshot;
  directJobId: string;
};

export interface DetailPageGenerationRepositoryPort {
  findActiveContentWorkspace(input: {
    organizationId: string;
    contentWorkspaceId: string;
  }): Promise<DetailPageContentWorkspaceSnapshot | null>;
  ensureRerunGenerationGroup(input: {
    organizationId: string;
    baseGenerationId: string;
    existingGroupId: string | null;
    contentWorkspaceId: string;
    title: string;
    triggeredByUserId: string | null;
  }): Promise<string>;
  openProcessingGenerationLedger(input: {
    organizationId: string;
    generationGroupId?: string | null;
    contentWorkspaceId: string;
    sourceCandidateId: string | null;
    triggeredByUserId: string | null;
    templateId: DetailPageTemplateId;
    rawInput: DetailPageRawInput;
    imageUrls: string[];
    rawTitle: string;
    sourceReferences: DetailPageSourceReference[];
    directJob: Omit<CreateAiDirectJobInput, 'organizationId' | 'sourceResourceId'>;
  }): Promise<DetailPageOpenProcessingGenerationLedgerResult>;
  markGenerationRejectedByParent(input: {
    organizationId: string;
    generationId: string;
    status: 'CANCELLED' | 'FAILED';
    errorMessage: string;
  }): Promise<void>;
  markGenerationFailed(input: {
    organizationId: string;
    generationId: string;
    errorMessage: string;
  }): Promise<void>;
  findGenerationStatus(input: {
    organizationId: string;
    generationId: string;
  }): Promise<{ status: string } | null>;
  markGenerationCancelledIfProcessing(input: {
    organizationId: string;
    generationId: string;
    processingStatuses: string[];
    errorMessage: string;
  }): Promise<number>;
  findRerunBase(input: {
    organizationId: string;
    generationId: string;
  }): Promise<DetailPageRerunBaseSnapshot | null>;
  findImageOnlyBaseCandidates(input: {
    organizationId: string;
    sourceCandidateId: string | null;
    contentWorkspaceId: string | null;
    templateId: DetailPageTemplateId;
  }): Promise<DetailPageImageOnlyBaseCandidateSnapshot[]>;
  findSourceCandidate(input: {
    organizationId: string;
    sourceCandidateId: string;
  }): Promise<DetailPageSourceCandidateSnapshot | null>;
  findSourceContentGeneration(input: {
    organizationId: string;
    sourceContentGenerationId: string;
  }): Promise<DetailPageSourceContentGenerationSnapshot | null>;
  findSourceContentAsset(input: {
    organizationId: string;
    contentAssetId: string;
  }): Promise<DetailPageSourceContentAssetSnapshot | null>;
  findCancellableGeneration(input: {
    organizationId: string;
    generationId: string;
  }): Promise<DetailPageCancellableGenerationSnapshot | null>;
  cancelProcessingGeneration(input: {
    organizationId: string;
    generationId: string;
    processingStatuses: string[];
    reason: string;
    generationResult: unknown;
  }): Promise<number>;
}
