'use client';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ContentAssetItem } from '@kiditem/shared/product-content';
import type { ThumbnailExecutionStatus } from '@kiditem/shared/thumbnail-execution';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { thumbnailExecutionIdChunks } from '../lib/thumbnail-registration';
import {
  confirmRepresentativeImageApplied,
  ListingChoiceRequiredError,
  markRepresentativeImageNotApplied,
  representativeImageUploadReached,
  resendRepresentativeImageViaExtension,
  submitRepresentativeImageViaExtension,
  type RepresentativeImageExecutionResult,
  type RepresentativeImageSubject,
} from '../lib/representative-image-execution';

/**
 * 대표이미지(KID-313 W3a). 작업공간의 갤러리(업로드 · AI 후보 자산)에서 하나를 채택하면 작업공간의
 * `currentThumbnailAssetId` 가 바뀐다(Content). 몰 반영은 (판매상품, 자산) 을 주인으로 하는 Channels 실행이다.
 */

/** 작업공간의 대표이미지 갤러리 — 업로드와 AI 후보, 새것부터. */
export function useThumbnailGallery(contentWorkspaceId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.contentWorkspaces.thumbnailGallery(contentWorkspaceId ?? 'none'),
    enabled: Boolean(contentWorkspaceId),
    queryFn: () =>
      apiClient.get<ContentAssetItem[]>(
        `/api/ai/content-workspaces/${encodeURIComponent(contentWorkspaceId!)}/thumbnail-gallery`,
      ),
  });
}

function invalidateRepresentativeImage(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.contentWorkspaces.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailJobs.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailExecutions.all }),
  ]);
}

/** 채택: 작업공간의 자산 하나를 대표이미지로. 다른 작업공간의 자산은 서버가 거절한다. */
export function useAdoptThumbnail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ contentWorkspaceId, assetId }: { contentWorkspaceId: string; assetId: string }) =>
      apiClient.patch<ContentAssetItem>(
        `/api/ai/content-workspaces/${encodeURIComponent(contentWorkspaceId)}/current-thumbnail`,
        { assetId },
      ),
    onSettled: () => invalidateRepresentativeImage(queryClient),
  });
}

/** 판매상품마다 가장 최근 대표이미지 몰 반영 실행(`GET /api/channels/thumbnail-executions`). */
export function useThumbnailExecutionStatuses(salesProductIds: readonly string[]) {
  const ids = [...new Set(salesProductIds)];
  return useQuery({
    queryKey: queryKeys.thumbnailExecutions.latest(ids),
    enabled: ids.length > 0,
    queryFn: async () => {
      const pages = await Promise.all(
        thumbnailExecutionIdChunks(ids).map((chunk) =>
          apiClient.get<{ items: ThumbnailExecutionStatus[] }>(
            `/api/channels/thumbnail-executions?salesProductIds=${chunk.map(encodeURIComponent).join(',')}`,
          ),
        ),
      );
      return pages.flatMap((page) => page?.items ?? []);
    },
    staleTime: 1000,
  });
}

function invalidateExecutions(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailJobs.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailExecutions.all }),
  ]);
}

/** 판매상품의 대표이미지를 몰 상품 수정 화면에 올린다. 자산을 주면 그 자산, 없으면 서버가 정한다. */
export function useWingRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RepresentativeImageSubject & { channelListingId?: string }) =>
      submitRepresentativeImageViaExtension(
        { salesProductId: input.salesProductId, assetId: input.assetId },
        input.channelListingId ? { channelListingId: input.channelListingId } : {},
      ),
    onSettled: () => invalidateExecutions(queryClient),
  });
}

export interface WingBatchItemResult {
  /** 화면의 줄 id(job id). */
  id: string;
  subject: RepresentativeImageSubject;
  success: boolean;
  screenshotPath: string | null;
  error?: string;
  /** 판매상품에 대표이미지를 받는 리스팅이 여럿이라 운영자가 골라야 올릴 수 있다. */
  needsListingChoice?: boolean;
}

export function useBatchWingRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (items: Array<{ id: string; subject: RepresentativeImageSubject }>) => {
      const results: WingBatchItemResult[] = [];
      for (const item of items) {
        try {
          const result: RepresentativeImageExecutionResult = await submitRepresentativeImageViaExtension(item.subject);
          // 배치의 성공은 "몰 수정 화면에 올렸다" 이다. 반영은 운영자가 저장 뒤 확인한다.
          const uploaded = representativeImageUploadReached(result);
          results.push({
            id: item.id,
            subject: item.subject,
            success: uploaded,
            screenshotPath: result.screenshotPath,
            ...(!uploaded && result.error ? { error: result.error } : {}),
          });
        } catch (error) {
          results.push({
            id: item.id,
            subject: item.subject,
            success: false,
            screenshotPath: null,
            error: error instanceof Error ? error.message : String(error),
            ...(error instanceof ListingChoiceRequiredError ? { needsListingChoice: true } : {}),
          });
        }
      }
      return { results };
    },
    onSettled: () => invalidateExecutions(queryClient),
  });
}

/**
 * 편집 화면의 몰 올리기: 고른 후보를 작업공간의 대표이미지로 채택한 뒤 그 자산을 올린다. 채택이 먼저라 등록 대기에서
 * 그 실행과 출구가 보인다.
 */
export function useAdoptAndUploadThumbnail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { contentWorkspaceId: string; salesProductId: string; assetId: string }) => {
      await apiClient.patch(
        `/api/ai/content-workspaces/${encodeURIComponent(input.contentWorkspaceId)}/current-thumbnail`,
        { assetId: input.assetId },
      );
      return submitRepresentativeImageViaExtension({ salesProductId: input.salesProductId, assetId: input.assetId });
    },
    onSettled: () => invalidateRepresentativeImage(queryClient),
  });
}

/** "확인 중" 인 같은 실행을 확장에 다시 보낸다. */
export function useResendWingRegistration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (executionId: string) => resendRepresentativeImageViaExtension(executionId),
    onSettled: () => invalidateExecutions(queryClient),
  });
}

/** "반영됨으로 표시" — 운영자가 몰에서 저장한 것을 확인했다. 성공으로 가는 유일한 길이다. */
export function useConfirmRegistrationApplied() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (executionId: string) => confirmRepresentativeImageApplied(executionId),
    onSettled: () => invalidateExecutions(queryClient),
  });
}

/** "반영 안 됨으로 표시" — 결과를 모르는 실행을 끝내 새 등록을 연다. */
export function useMarkRegistrationNotApplied() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (executionId: string) => markRepresentativeImageNotApplied(executionId),
    onSettled: () => invalidateExecutions(queryClient),
  });
}

/** 운영자가 치운 판매상품의 실패는 최근 실행 목록에서 빠진다(행은 Channels 에 남는다). */
export function useClearRegistrationError() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (salesProductId: string) =>
      apiClient.delete<{ dismissed: boolean }>(
        `/api/channels/thumbnail-executions/failed/${encodeURIComponent(salesProductId)}`,
      ),
    onSettled: () => invalidateExecutions(queryClient),
  });
}
