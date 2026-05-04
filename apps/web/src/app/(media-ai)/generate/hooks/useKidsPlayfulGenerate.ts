'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { API_BASE } from '@/lib/api';
import type {
  DetailPageGenerationRaw,
  KidsPlayfulData,
} from '../lib/kids-playful-types';
import { adaptToKidsPlayful } from '../lib/kids-playful-types';

export interface KidsPlayfulGenerateBody {
  rawTitle: string;
  rawCategory: string;
  rawDescription: string;
  rawOptions: string;
  imageUrls: string[];
  heroImageMode?: 'first' | 'llm-pick';
  /** sourcing MasterProduct.id — generate 페이지 직접 생성 시 omit */
  productId?: string;
  templateId?: string;
}

/** Server endpoint 응답 형 (POST generate / GET list 공용). */
export interface KidsPlayfulGenerationItem {
  id: string;
  productId: string | null;
  templateId: string;
  productName: string;
  rawInput: unknown;
  result: DetailPageGenerationRaw;
  imageUrls: string[];
  /** originalIndex → processed image URL (백그라운드로 채워짐) */
  processedImages: Record<string, string>;
  /** "pending" | "processing" | "completed" | "failed" */
  imageProcessingStatus: 'pending' | 'processing' | 'completed' | 'failed' | string;
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
 *   onMutate 시점에 즉시 placeholder pending row 를 KP/SV cache 에 prepend → 배너 즉시 노출.
 *   onSuccess 시 invalidate 로 실제 row 와 교체. onError 시 placeholder 제거.
 */
export function useKidsPlayfulGenerate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: KidsPlayfulGenerateBody) =>
      apiClient.post<KidsPlayfulGenerationItem>('/api/ai/detail-page/generate', body),
    onMutate: async (vars) => {
      const tplId = vars.templateId ?? 'kids-playful';
      const isSV = tplId === 'simple-vertical';
      const listKey = isSV
        ? (['sv-generations', { productId: vars.productId ?? null }] as const)
        : QK.list(vars.productId);
      const allKey = isSV
        ? (['sv-generations', { productId: null }] as const)
        : (['kp-generations'] as const);

      // 진행 중 refetch 취소 후 placeholder 직접 삽입 (cache mutation)
      await qc.cancelQueries({ queryKey: listKey });
      const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const placeholder: KidsPlayfulGenerationItem = {
        id: optimisticId,
        productId: vars.productId ?? null,
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
      qc.setQueryData<KidsPlayfulGenerationItem[]>(allKey, (old = []) => [placeholder, ...old]);
      return { optimisticId, listKey, allKey };
    },
    onError: (_err, _vars, ctx) => {
      // placeholder 제거
      if (!ctx) return;
      const remove = (arr: KidsPlayfulGenerationItem[] | undefined): KidsPlayfulGenerationItem[] =>
        (arr ?? []).filter((x) => x.id !== ctx.optimisticId);
      qc.setQueryData<KidsPlayfulGenerationItem[]>(ctx.listKey, remove);
      qc.setQueryData<KidsPlayfulGenerationItem[]>(ctx.allKey, remove);
    },
    onSettled: () => {
      // 성공/실패 무관 — 최종 invalidate (success 시 실제 row 로 교체)
      qc.invalidateQueries({ queryKey: ['kp-generations'] });
      qc.invalidateQueries({ queryKey: ['sv-generations'] });
    },
  });
}

/**
 * GET /api/ai/detail-page/:id — 단건 조회.
 * 에디터에서 ?kpId=... 쿼리로 진입 시 사용.
 */
export function useKidsPlayfulOne(id?: string | null) {
  return useQuery({
    queryKey: id ? QK.one(id) : ['kp-generations', 'one', 'noop'],
    queryFn: () => apiClient.get<KidsPlayfulGenerationItem>(`/api/ai/detail-page/${id}`),
    enabled: !!id,
  });
}

/**
 * GET /api/ai/detail-page?productId=...
 * productId omit → 전체. given → 그 product 만.
 *
 * 진행 중 (pending/processing) entry 가 있으면 5초 polling — 누끼 결과 점진 반영.
 */
export function useKidsPlayfulGenerationList(productId?: string | null) {
  return useQuery({
    queryKey: QK.list(productId),
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
      return inProgress ? 5000 : false;
    },
  });
}

/**
 * GET /api/ai/detail-page?templateId=simple-vertical&productId=...
 * simple-vertical 이력. 결과는 SimpleVerticalGeneration 형식 (result 필드).
 */
export function useSimpleVerticalGenerationList(productId?: string | null) {
  return useQuery({
    queryKey: ['sv-generations', { productId: productId ?? null }] as const,
    queryFn: () =>
      apiClient.get<KidsPlayfulGenerationItem[]>(
        productId
          ? `/api/ai/detail-page?templateId=simple-vertical&productId=${encodeURIComponent(productId)}`
          : '/api/ai/detail-page?templateId=simple-vertical',
      ),
    refetchInterval: (query) => {
      const data = query.state.data as KidsPlayfulGenerationItem[] | undefined;
      if (!data) return false;
      const inProgress = data.some(
        (e) =>
          e.imageProcessingStatus === 'pending' ||
          e.imageProcessingStatus === 'processing',
      );
      return inProgress ? 5000 : false;
    },
  });
}

/** DELETE /api/ai/detail-page/:id — soft delete. KP/SV 둘 다 invalidate. */
export function useKidsPlayfulGenerationDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete<{ ok: true }>(`/api/ai/detail-page/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kp-generations'] });
      qc.invalidateQueries({ queryKey: ['sv-generations'] });
    },
  });
}

/** DB row → KidsPlayfulRenderer 가 받는 props 형으로 변환. processedImages 우선, fallback imageUrls. */
export function rowToRendererData(item: KidsPlayfulGenerationItem): KidsPlayfulData {
  return adaptToKidsPlayful(item.result, item.imageUrls, item.processedImages, API_BASE);
}

/**
 * 특정 product 에 진행 중 (pending/processing) 생성 entry 가 있는지 — 첫 1건만.
 * KP + SV 모두 polling — 어느 templateId 든 진행 중이면 반환.
 * (다건 모두 보고 싶으면 useAllGenerationsInProgress 사용)
 */
export function useKidsPlayfulInProgress(productId?: string | null) {
  const all = useAllGenerationsInProgress(productId);
  return all[0] ?? null;
}

/**
 * 진행 중 (pending/processing) entry 전부 반환. KP + SV merge.
 * - productId omit → 모든 product (리스트 페이지용)
 * - productId given → 해당 product 만 (detail 페이지용)
 *
 * 정렬: createdAt 오름차순 (먼저 시작된 것 위에) — 안정적 키 + 사용자 멘탈 모델.
 */
export function useAllGenerationsInProgress(
  productId?: string | null,
): KidsPlayfulGenerationItem[] {
  const { data: kpData = [] } = useKidsPlayfulGenerationList(productId);
  const { data: svData = [] } = useSimpleVerticalGenerationList(productId);
  return [...kpData, ...svData]
    .filter(
      (e) =>
        e.imageProcessingStatus === 'pending' ||
        e.imageProcessingStatus === 'processing',
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

/** 카드 썸네일에 쓸 첫 이미지. processed 우선, fallback raw. */
export function rowThumbnail(item: KidsPlayfulGenerationItem): string | null {
  const heroIdx = item.result.section1.heroImageIndex;
  if (heroIdx !== null) {
    const processed = item.processedImages[String(heroIdx)];
    if (processed) return processed.startsWith('http') ? processed : `${API_BASE}${processed}`;
    if (item.imageUrls[heroIdx]) return item.imageUrls[heroIdx];
  }
  return item.imageUrls[0] ?? null;
}
