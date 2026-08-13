import {
  SourcingKeywordPreferenceListSchema,
  SourcingKeywordPreferenceSchema,
  SourcingInterestTargetCommandSchema,
  SourcingInterestTargetListSchema,
  SourcingInterestTargetSchema,
  SourcingRecommendationEnvelopeSchema,
  SourcingReviewBatchSchema,
  SourcingReviewSelectionListSchema,
  SourcingReviewSelectionSchema,
  SourcingValidationEnvelopeSchema,
  type RecommendationSurface,
  type SourcingCoupangObservationCommand,
  type SourcingKeywordPreferenceCommand,
  type SourcingInterestTargetCommand,
  type SourcingInterestTarget,
  type SourcingRecommendationEnvelope,
  type SourcingReviewBatch,
  type SourcingReviewBatchCommand,
  type SourcingReviewSelection,
  type SourcingReviewSelectionCommand,
  type SourcingValidationEnvelope,
} from '@kiditem/shared/sourcing';
import { apiClient } from '@/lib/api-client';

const DEFAULT_LIMIT = 50;

export const sourcingWorkspaceApi = {
  async recommendations(input: {
    surface: RecommendationSurface;
    limit?: number;
    cursor?: string;
  }): Promise<SourcingRecommendationEnvelope> {
    const params = new URLSearchParams({
      surface: input.surface,
      limit: String(input.limit ?? DEFAULT_LIMIT),
    });
    if (input.cursor) params.set('cursor', input.cursor);
    return apiClient.getParsed(
      `/api/sourcing/workspace/recommendations?${params.toString()}`,
      SourcingRecommendationEnvelopeSchema,
    );
  },

  async refreshRecommendations(): Promise<SourcingRecommendationEnvelope> {
    const raw = await apiClient.post<unknown>('/api/sourcing/workspace/recommendations/refresh');
    return SourcingRecommendationEnvelopeSchema.parse(raw);
  },

  async ingestCoupangObservations(input: SourcingCoupangObservationCommand): Promise<void> {
    await apiClient.post<unknown>('/api/sourcing/workspace/coupang-observations', input);
  },

  async validation(input: { limit?: number; cursor?: string } = {}): Promise<SourcingValidationEnvelope> {
    const params = new URLSearchParams({ limit: String(input.limit ?? DEFAULT_LIMIT) });
    if (input.cursor) params.set('cursor', input.cursor);
    return apiClient.getParsed(
      `/api/sourcing/workspace/validation?${params.toString()}`,
      SourcingValidationEnvelopeSchema,
    );
  },

  async refreshValidation(): Promise<SourcingValidationEnvelope> {
    const raw = await apiClient.post<unknown>('/api/sourcing/workspace/validation/refresh');
    return SourcingValidationEnvelopeSchema.parse(raw);
  },

  async reviewSelections(input: {
    workspaceKey: 'entry' | 'final';
    recommendationRunId: string;
  }): Promise<SourcingReviewSelection[]> {
    const params = new URLSearchParams(input);
    return apiClient.getParsed(
      `/api/sourcing/workspace/review-selections?${params.toString()}`,
      SourcingReviewSelectionListSchema,
    );
  },

  async saveReviewSelection(input: {
    itemKey: string;
    command: SourcingReviewSelectionCommand;
  }): Promise<SourcingReviewSelection> {
    const raw = await apiClient.put<unknown>(
      `/api/sourcing/workspace/review-selections/${encodeURIComponent(input.itemKey)}`,
      input.command,
    );
    return SourcingReviewSelectionSchema.parse(raw);
  },

  async createReviewBatch(command: SourcingReviewBatchCommand): Promise<SourcingReviewBatch> {
    const raw = await apiClient.post<unknown>('/api/sourcing/workspace/review-batches', command);
    return SourcingReviewBatchSchema.parse(raw);
  },

  async keywordPreferences() {
    return apiClient.getParsed(
      '/api/sourcing/workspace/keyword-preferences',
      SourcingKeywordPreferenceListSchema,
    );
  },

  async saveKeywordPreference(input: {
    keyword: string;
    command: SourcingKeywordPreferenceCommand;
  }) {
    const raw = await apiClient.put<unknown>(
      `/api/sourcing/workspace/keyword-preferences/${encodeURIComponent(input.keyword)}`,
      input.command,
    );
    return SourcingKeywordPreferenceSchema.parse(raw);
  },

  async interests(): Promise<SourcingInterestTarget[]> {
    return apiClient.getParsed(
      '/api/sourcing/workspace/interests',
      SourcingInterestTargetListSchema,
    );
  },

  async saveInterest(command: SourcingInterestTargetCommand): Promise<SourcingInterestTarget> {
    const raw = await apiClient.post<unknown>(
      '/api/sourcing/workspace/interests',
      SourcingInterestTargetCommandSchema.parse(command),
    );
    return SourcingInterestTargetSchema.parse(raw);
  },

  async removeInterest(targetId: string): Promise<void> {
    await apiClient.delete(
      `/api/sourcing/workspace/interests/${encodeURIComponent(targetId)}`,
    );
  },
};
