'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  RecommendationSurface,
  ReviewWorkspaceKey,
  SourcingCoupangObservationCommand,
  SourcingKeywordPreferenceCommand,
  SourcingInterestTargetCommand,
  SourcingReviewBatchCommand,
  SourcingReviewSelectionCommand,
} from '@kiditem/shared/sourcing';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/query-keys';
import { sourcingWorkspaceApi } from '../lib/sourcing-workspace-api';

function useSourcingWorkspaceOrganizationId(): string | null {
  return useAuth().user?.organizationId ?? null;
}

export function useSourcingRecommendations(
  surface: RecommendationSurface,
  input: { limit?: number; cursor?: string } = {},
) {
  const organizationId = useSourcingWorkspaceOrganizationId();
  return useQuery({
    queryKey: queryKeys.sourcing.workspace.recommendations(organizationId ?? 'no-organization', surface),
    queryFn: () => sourcingWorkspaceApi.recommendations({ surface, ...input }),
    enabled: organizationId !== null,
    refetchInterval: 60_000,
  });
}

export function useIngestSourcingCoupangObservations() {
  const organizationId = useSourcingWorkspaceOrganizationId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SourcingCoupangObservationCommand) =>
      sourcingWorkspaceApi.ingestCoupangObservations(input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.sourcing.workspace.root(organizationId ?? 'no-organization'),
      }),
  });
}

export function useSourcingValidation(input: { limit?: number; cursor?: string } = {}) {
  const organizationId = useSourcingWorkspaceOrganizationId();
  return useQuery({
    queryKey: queryKeys.sourcing.workspace.validation(organizationId ?? 'no-organization'),
    queryFn: () => sourcingWorkspaceApi.validation(input),
    enabled: organizationId !== null,
    refetchInterval: 60_000,
  });
}

export function useRefreshSourcingRecommendations() {
  const organizationId = useSourcingWorkspaceOrganizationId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sourceAttemptId: string) => {
      const envelope = await sourcingWorkspaceApi.refreshRecommendations(sourceAttemptId);
      if (!envelope.data?.runId) {
        throw new Error(envelope.error?.message ?? 'recommendations were not refreshed');
      }
      return envelope;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.sourcing.workspace.root(organizationId ?? 'no-organization'),
      }),
  });
}

export function useRefreshSourcingValidation() {
  const organizationId = useSourcingWorkspaceOrganizationId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const envelope = await sourcingWorkspaceApi.refreshValidation();
      if (!envelope.ready) throw new Error(envelope.error?.message ?? 'validation was not refreshed');
      return envelope;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.sourcing.workspace.root(organizationId ?? 'no-organization'),
      }),
  });
}

export function useSourcingReviewSelections(
  workspaceKey: ReviewWorkspaceKey,
  recommendationRunId: string | null,
) {
  const organizationId = useSourcingWorkspaceOrganizationId();
  return useQuery({
    queryKey: queryKeys.sourcing.workspace.reviewSelections(
      organizationId ?? 'no-organization',
      workspaceKey,
      recommendationRunId ?? 'no-run',
    ),
    queryFn: () =>
      sourcingWorkspaceApi.reviewSelections({
        workspaceKey,
        recommendationRunId: recommendationRunId!,
      }),
    enabled: organizationId !== null && recommendationRunId !== null,
  });
}

export function useSaveSourcingReviewSelection() {
  const organizationId = useSourcingWorkspaceOrganizationId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { itemKey: string; command: SourcingReviewSelectionCommand }) =>
      sourcingWorkspaceApi.saveReviewSelection(input),
    onSuccess: (selection) =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.sourcing.workspace.reviewSelections(
          organizationId ?? 'no-organization',
          selection.workspaceKey,
          selection.recommendationRunId,
        ),
      }),
  });
}

export function useCreateSourcingReviewBatch() {
  const organizationId = useSourcingWorkspaceOrganizationId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: SourcingReviewBatchCommand) => sourcingWorkspaceApi.createReviewBatch(command),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.sourcing.workspace.root(organizationId ?? 'no-organization'),
      }),
  });
}

export function useSourcingKeywordPreferences() {
  const organizationId = useSourcingWorkspaceOrganizationId();
  return useQuery({
    queryKey: queryKeys.sourcing.workspace.keywordPreferences(organizationId ?? 'no-organization'),
    queryFn: sourcingWorkspaceApi.keywordPreferences,
    enabled: organizationId !== null,
  });
}

export function useSaveSourcingKeywordPreference() {
  const organizationId = useSourcingWorkspaceOrganizationId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { keyword: string; command: SourcingKeywordPreferenceCommand }) =>
      sourcingWorkspaceApi.saveKeywordPreference(input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.sourcing.workspace.keywordPreferences(organizationId ?? 'no-organization'),
      }),
  });
}

export function useSourcingInterestTargets() {
  const organizationId = useSourcingWorkspaceOrganizationId();
  return useQuery({
    queryKey: queryKeys.sourcing.workspace.interests(organizationId ?? 'no-organization'),
    queryFn: sourcingWorkspaceApi.interests,
    enabled: organizationId !== null,
    refetchInterval: 60_000,
  });
}

export function useSaveSourcingInterestTarget() {
  const organizationId = useSourcingWorkspaceOrganizationId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: SourcingInterestTargetCommand) =>
      sourcingWorkspaceApi.saveInterest(command),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.sourcing.workspace.root(organizationId ?? 'no-organization'),
      }),
  });
}

export function useRemoveSourcingInterestTarget() {
  const organizationId = useSourcingWorkspaceOrganizationId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targetId: string) => sourcingWorkspaceApi.removeInterest(targetId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.sourcing.workspace.root(organizationId ?? 'no-organization'),
      }),
  });
}
