'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DetailImageCount,
  DetailPageAgeGroup,
  DetailPageTemplateId,
} from '@kiditem/shared/ai';
import { apiClient } from '@/lib/api-client';
import { API_BASE } from '@/lib/api';
import type {
  DetailPageGenerationRaw,
  KidsPlayfulData,
} from '../lib/kids-playful-types';
import { adaptToKidsPlayful } from '../lib/kids-playful-types';
import { isSafetyLabelImageUrl } from '../lib/detail-page-image-order';

const GENERATED_HERO_BANNER_KEY = '__heroBanner';

export interface KidsPlayfulGenerateBody {
  rawTitle: string;
  rawCategory: string;
  rawDescription: string;
  rawOptions: string;
  imageUrls: string[];
  heroImageMode?: 'first' | 'llm-pick';
  ageGroup?: DetailPageAgeGroup;
  detailImageCount?: DetailImageCount;
  usageSectionMode?: 'include' | 'exclude';
  kcCertificationStatus?: 'unknown' | 'none' | 'exists';
  kcCertificationNumber?: string;
  /** sourcing MasterProduct.id — generate 페이지 직접 생성 시 omit */
  productId?: string;
  registrationWorkspaceId?: string;
  templateId?: DetailPageTemplateId;
  generationMode?: 'draft' | 'image' | 'full';
  sourceReferences?: Array<{
    sourceType: 'sourcing_candidate' | 'input_asset' | 'content_generation';
    sourceCandidateId?: string;
    contentAssetId?: string;
    sourceContentGenerationId?: string;
    label?: string;
  }>;
}

/** Server endpoint 응답 형 (POST generate / GET list 공용). */
export interface KidsPlayfulGenerationItem {
  id: string;
  productId: string | null;
  sourceCandidateId?: string | null;
  registrationWorkspaceId?: string | null;
  templateId: string;
  productName: string;
  rawInput: unknown;
  result: DetailPageGenerationRaw;
  imageUrls: string[];
  /** originalIndex → processed image URL (백그라운드로 채워짐) */
  processedImages: Record<string, string>;
  /** "pending" | "processing" | "completed" | "failed" | "cancelled" */
  imageProcessingStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | string;
  imageProcessingError: string | null;
  createdAt: string;
}

const QK = {
  list: (productId?: string | null) =>
    productId ? (['kp-generations', { productId }] as const) : (['kp-generations'] as const),
  one: (id: string) => ['kp-generations', 'one', id] as const,
};

/**
 * POST /api/ai/detail-page/generate
 * 생성 + DB 자동 저장 (companyId scope).
 *
 * **Optimistic insert** — 사용자 요청: "버튼 누르면 바로 생성 중 표시"
 *   onMutate 시점에 즉시 placeholder pending row 를 Trend/KIDITEM cache 에 prepend → 배너 즉시 노출.
 *   onSuccess 시 invalidate 로 실제 row 와 교체. onError 시 placeholder 제거.
 */
export function useKidsPlayfulGenerate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: KidsPlayfulGenerateBody) =>
      apiClient.post<KidsPlayfulGenerationItem>('/api/ai/detail-page/generate', body),
    onMutate: async (vars) => {
      const tplId = vars.templateId ?? 'kids-playful';
      const isBoldVertical = tplId === 'bold-vertical';
      const listKey = isBoldVertical
        ? (['bold-generations', { productId: vars.productId ?? null }] as const)
        : QK.list(vars.productId);
      const allKey = isBoldVertical
        ? (['bold-generations', { productId: null }] as const)
        : (['kp-generations'] as const);
      const shouldMirrorAllKey = JSON.stringify(listKey) !== JSON.stringify(allKey);

      // 진행 중 refetch 취소 후 placeholder 직접 삽입 (cache mutation)
      await qc.cancelQueries({ queryKey: listKey });
      if (shouldMirrorAllKey) {
        await qc.cancelQueries({ queryKey: allKey });
      }
      const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const placeholder: KidsPlayfulGenerationItem = {
        id: optimisticId,
        productId: vars.productId ?? null,
        registrationWorkspaceId: vars.registrationWorkspaceId ?? null,
        templateId: tplId,
        productName: vars.rawTitle,
        rawInput: vars,
        result: {} as DetailPageGenerationRaw,
        imageUrls: vars.imageUrls,
        processedImages: {},
        imageProcessingStatus: 'pending',
        imageProcessingError: null,
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<KidsPlayfulGenerationItem[]>(listKey, (old = []) => [placeholder, ...old]);
      // productId 없는 전체 list 도 mirror (sourcing 리스트 페이지)
      if (shouldMirrorAllKey) {
        qc.setQueryData<KidsPlayfulGenerationItem[]>(allKey, (old = []) => [placeholder, ...old]);
      }
      return { optimisticId, listKey, allKey: shouldMirrorAllKey ? allKey : null };
    },
    onError: (_err, _vars, ctx) => {
      // placeholder 제거
      if (!ctx) return;
      const remove = (arr: KidsPlayfulGenerationItem[] | undefined): KidsPlayfulGenerationItem[] =>
        (arr ?? []).filter((x) => x.id !== ctx.optimisticId);
      qc.setQueryData<KidsPlayfulGenerationItem[]>(ctx.listKey, remove);
      if (ctx.allKey) {
        qc.setQueryData<KidsPlayfulGenerationItem[]>(ctx.allKey, remove);
      }
    },
    onSettled: () => {
      // 성공/실패 무관 — 최종 invalidate (success 시 실제 row 로 교체)
      qc.invalidateQueries({ queryKey: ['kp-generations'] });
      qc.invalidateQueries({ queryKey: ['bold-generations'] });
    },
  });
}

/**
 * GET /api/ai/detail-page/:id — 단건 조회.
 * sourcing 에디터에서 ?generationId=... 쿼리로 진입 시 사용.
 *
 * 상세페이지 생성은 PR #213 부터 Agent OS 비동기 큐로 동작한다. 사용자가
 * 폼 제출 후 곧바로 에디터로 진입하면 row 가 아직 `pending`/`processing` 일
 * 수 있으므로, 리스트 쿼리와 같은 status-aware refetchInterval 로 자동
 * 폴링한다. terminal 상태 (`completed`/`failed`) 가 되면 폴링 중단.
 */
export function useKidsPlayfulOne(id?: string | null) {
  return useQuery({
    queryKey: id ? QK.one(id) : ['kp-generations', 'one', 'noop'],
    queryFn: () => apiClient.get<KidsPlayfulGenerationItem>(`/api/ai/detail-page/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data as KidsPlayfulGenerationItem | undefined;
      if (!data) return false;
      const inProgress =
        data.imageProcessingStatus === 'pending' ||
        data.imageProcessingStatus === 'processing';
      return inProgress ? 5000 : false;
    },
    refetchIntervalInBackground: false,
    staleTime: 1000,
  });
}

/**
 * GET /api/ai/detail-page?productId=...
 * productId omit → 전체. given → 그 product 만.
 *
 * 진행 중 (pending/processing) entry 가 있으면 느린 polling — 상세페이지 이미지 생성은 길고 무거워
 * 여러 탭에서 429가 나지 않도록 백그라운드 polling은 끈다.
 */
export function useKidsPlayfulGenerationList(
  productId?: string | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: QK.list(productId),
    enabled: options.enabled ?? true,
    queryFn: () =>
      apiClient.get<KidsPlayfulGenerationItem[]>(
        productId
          ? `/api/ai/detail-page?templateId=kids-playful&productId=${encodeURIComponent(productId)}`
          : '/api/ai/detail-page?templateId=kids-playful',
      ),
    refetchInterval: (query) => {
      const data = query.state.data as KidsPlayfulGenerationItem[] | undefined;
      if (!data) return false;
      const inProgress = data.some(
        (e) =>
          e.imageProcessingStatus === 'pending' ||
          e.imageProcessingStatus === 'processing',
      );
      return inProgress ? 15000 : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: 5000,
  });
}

/**
 * GET /api/ai/detail-page?templateId=bold-vertical&productId=...
 * KIDITEM BoldVertical 이력. 결과는 BoldVertical generation 형식 (result 필드).
 */
export function useBoldVerticalGenerationList(
  productId?: string | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ['bold-generations', { productId: productId ?? null }] as const,
    enabled: options.enabled ?? true,
    queryFn: () =>
      apiClient.get<KidsPlayfulGenerationItem[]>(
        productId
          ? `/api/ai/detail-page?templateId=bold-vertical&productId=${encodeURIComponent(productId)}`
          : '/api/ai/detail-page?templateId=bold-vertical',
      ),
    refetchInterval: (query) => {
      const data = query.state.data as KidsPlayfulGenerationItem[] | undefined;
      if (!data) return false;
      const inProgress = data.some(
        (e) =>
          e.imageProcessingStatus === 'pending' ||
          e.imageProcessingStatus === 'processing',
      );
      return inProgress ? 15000 : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: 5000,
  });
}

/** DELETE /api/ai/detail-page/:id — soft delete. Trend/KIDITEM 둘 다 invalidate. */
export function useKidsPlayfulGenerationDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete<{ ok: true }>(`/api/ai/detail-page/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kp-generations'] });
      qc.invalidateQueries({ queryKey: ['bold-generations'] });
    },
  });
}

/** POST /api/ai/detail-page/:id/cancel — 진행 중 생성 중단. */
export function useKidsPlayfulGenerationCancel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<KidsPlayfulGenerationItem>(`/api/ai/detail-page/${id}/cancel`),
    onMutate: async (id) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: ['kp-generations'] }),
        qc.cancelQueries({ queryKey: ['bold-generations'] }),
      ]);
      const markCancelled = (
        old: KidsPlayfulGenerationItem[] | undefined,
      ): KidsPlayfulGenerationItem[] | undefined =>
        old?.map((item) =>
          item.id === id
            ? {
                ...item,
                imageProcessingStatus: 'cancelled',
                imageProcessingError: '사용자 요청으로 생성이 중단되었습니다.',
              }
            : item,
        );

      qc.setQueriesData<KidsPlayfulGenerationItem[]>(
        { queryKey: ['kp-generations'] },
        markCancelled,
      );
      qc.setQueriesData<KidsPlayfulGenerationItem[]>(
        { queryKey: ['bold-generations'] },
        markCancelled,
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['kp-generations'] });
      qc.invalidateQueries({ queryKey: ['bold-generations'] });
    },
  });
}

/** DB row → KidsPlayfulRenderer 가 받는 props 형으로 변환. processedImages 우선, fallback imageUrls. */
export function rowToRendererData(item: KidsPlayfulGenerationItem): KidsPlayfulData {
  return adaptToKidsPlayful(item.result, item.imageUrls, item.processedImages, API_BASE);
}

/**
 * 특정 product 에 진행 중 (pending/processing) 생성 entry 가 있는지 — 첫 1건만.
 * Trend + KIDITEM 모두 polling — 어느 templateId 든 진행 중이면 반환.
 * (다건 모두 보고 싶으면 useAllGenerationsInProgress 사용)
 */
export function useKidsPlayfulInProgress(
  productId?: string | null,
  options: { enabled?: boolean } = {},
) {
  const all = useAllGenerationsInProgress(productId, options);
  return all[0] ?? null;
}

/**
 * 진행 중 (pending/processing) entry 전부 반환. Trend + KIDITEM merge.
 * - productId omit → 모든 product (리스트 페이지용)
 * - productId given → 해당 product 만 (detail 페이지용)
 *
 * 정렬: createdAt 오름차순 (먼저 시작된 것 위에) — 안정적 키 + 사용자 멘탈 모델.
 */
export function useAllGenerationsInProgress(
  productId?: string | null,
  options: { enabled?: boolean } = {},
): KidsPlayfulGenerationItem[] {
  const { data: kpData = [] } = useKidsPlayfulGenerationList(productId, options);
  const { data: boldData = [] } = useBoldVerticalGenerationList(productId, options);
  return [...kpData, ...boldData]
    .filter(
      (e) =>
        e.imageProcessingStatus === 'pending' ||
        e.imageProcessingStatus === 'processing',
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

/** 카드 썸네일에 쓸 첫 이미지. processed 우선, fallback raw. */
export function rowThumbnail(item: KidsPlayfulGenerationItem): string | null {
  const generatedHero = item.processedImages[GENERATED_HERO_BANNER_KEY];
  if (generatedHero) return generatedHero.startsWith('http') ? generatedHero : `${API_BASE}${generatedHero}`;

  const result = item.result as unknown;
  const heroIdx = item.templateId === 'bold-vertical'
    ? (result as { hook?: { imageIndex?: number | null; bannerImageIndex?: number | null } }).hook?.imageIndex ??
      (result as { hook?: { imageIndex?: number | null; bannerImageIndex?: number | null } }).hook?.bannerImageIndex ??
      null
    : item.result.section1?.heroImageIndex ?? null;
  if (heroIdx !== null) {
    const processed = item.processedImages[String(heroIdx)];
    if (processed) return processed.startsWith('http') ? processed : `${API_BASE}${processed}`;
    if (item.imageUrls[heroIdx] && !isSafetyLabelImageUrl(item.imageUrls[heroIdx])) {
      return item.imageUrls[heroIdx];
    }
  }
  return item.imageUrls.find((url) => !isSafetyLabelImageUrl(url)) ?? item.imageUrls[0] ?? null;
}

export function rowDisplayTitle(item: KidsPlayfulGenerationItem): string {
  if (item.templateId === 'bold-vertical') {
    const hookText = (item.result as unknown as { hook?: { text?: unknown } }).hook?.text;
    return typeof hookText === 'string' && hookText.trim() ? hookText : item.productName;
  }
  return item.result.section1?.mainHeadline ?? item.productName;
}

export function rowDisplaySubtitle(item: KidsPlayfulGenerationItem): string {
  if (item.templateId === 'bold-vertical') {
    const hook = (item.result as unknown as { hook?: { subtext?: unknown; titleSub?: unknown } }).hook;
    const value = hook?.titleSub ?? hook?.subtext;
    return typeof value === 'string' ? value : 'KIDITEM DESIGN';
  }
  return item.result.section1?.subhead ?? 'TREND VERTICAL';
}

export function rowTemplateLabel(item: KidsPlayfulGenerationItem): string {
  return item.templateId === 'bold-vertical' ? 'KIDITEM DESIGN' : 'TREND VERTICAL';
}
