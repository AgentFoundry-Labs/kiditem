'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type {
  RecomposeVariantKey,
  ThumbnailAnalysisResult,
  ThumbnailGenerationItem,
} from '@kiditem/shared/ai';
import { useAnalyze } from './useThumbnailAnalysis';
import {
  useApplyGeneration,
  useCancelGeneration,
  useCreateEditJobs,
  useDeleteGeneration,
  useSelectCandidate,
  useSkipGeneration,
  useWingRegister,
} from '../../_shared/hooks/useThumbnailGenerations';

interface Options {
  onAfterEditStarted?: (gen: ThumbnailGenerationItem) => void;
  onAfterClose?: () => void;
}

export function useThumbnailActions(
  refetchGenerations: () => void,
  options: Options = {},
) {
  const analyzeMutation = useAnalyze();
  const editJobsMutation = useCreateEditJobs();
  const selectCandidateMutation = useSelectCandidate();
  const applyGenerationMutation = useApplyGeneration();
  const skipGenerationMutation = useSkipGeneration();
  const cancelGenerationMutation = useCancelGeneration();
  const deleteGenerationMutation = useDeleteGeneration();
  const wingRegisterMutation = useWingRegister();

  const [aiResults, setAiResults] = useState<Record<string, ThumbnailAnalysisResult>>({});
  const [aiAnalyzingId, setAiAnalyzingId] = useState<string | null>(null);
  const [wingRegisteringIds, setWingRegisteringIds] = useState<Set<string>>(new Set());

  const mergeAiResults = (results: ThumbnailAnalysisResult[]) =>
    setAiResults((prev) => {
      const next = { ...prev };
      for (const r of results) next[r.productId] = r;
      return next;
    });

  /**
   * Single-product 편집 시작.
   *
   * 박스/상품 분류 결과(`recompose`)는 분석 시점에 이미 DB에 저장됨.
   * UI 가 카드에서 직접 variantKey 를 정해서 넘겨주는 흐름이라
   * 여기선 분류 호출 없이 바로 편집 job 만 띄운다.
   */
  const editSingle = async (
    productId: string,
    purpose: 'compliance' | 'quality' = 'compliance',
    variantKey?: RecomposeVariantKey,
  ) => {
    try {
      const created = await editJobsMutation.mutateAsync({
        productIds: [productId],
        purpose,
        variantKey,
      });
      if (Array.isArray(created)) {
        const genItem = created.find((d) => d.productId === productId);
        if (genItem) options.onAfterEditStarted?.(genItem);
      }
      refetchGenerations();
      toast.success('AI 편집 시작');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI 편집 실패');
    }
  };

  const editBatch = async (productIds: string[]) => {
    if (productIds.length === 0) return;
    try {
      // batch 는 항상 auto — variant 선택은 single-product 전용 UX.
      await editJobsMutation.mutateAsync({ productIds });
      toast.success(`${productIds.length}개 AI 편집 시작`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '일괄 편집 실패');
    }
  };

  const selectCandidate = async (generationId: string, selectedUrl: string) => {
    try {
      await selectCandidateMutation.mutateAsync({ id: generationId, selectedUrl });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '후보 선택 실패');
    }
  };

  const markApplied = async (generationId: string) => {
    try {
      await applyGenerationMutation.mutateAsync(generationId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '적용 처리 실패');
    }
  };

  const skipGeneration = async (generationId: string) => {
    try {
      await skipGenerationMutation.mutateAsync(generationId);
      options.onAfterClose?.();
      toast.success('건너뛰기 완료');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '건너뛰기 실패');
    }
  };

  const cancelGeneration = async (generationId: string) => {
    try {
      await cancelGenerationMutation.mutateAsync(generationId);
      options.onAfterClose?.();
      toast.success('생성 중단 요청 완료');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '생성 중단 실패');
    }
  };

  const deleteGeneration = async (generationId: string) => {
    try {
      await deleteGenerationMutation.mutateAsync(generationId);
      options.onAfterClose?.();
      toast.success('이력 삭제 완료');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제 실패');
    }
  };

  const openCoupangEdit = async (gen: ThumbnailGenerationItem) => {
    if (!gen.selectedUrl) {
      toast.error('선택된 이미지가 없습니다');
      return;
    }
    setWingRegisteringIds((prev) => new Set(prev).add(gen.id));
    try {
      const result = await wingRegisterMutation.mutateAsync(gen.id);
      if (result.success) {
        toast.success('Wing 대표이미지 업로드 완료 — 열린 Wing 화면 확인 후 저장하세요');
        markApplied(gen.id);
        options.onAfterClose?.();
      } else {
        toast.error(result.error ?? 'Wing 업로드 실패');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Wing 연동 오류');
    } finally {
      setWingRegisteringIds((prev) => {
        const next = new Set(prev);
        next.delete(gen.id);
        return next;
      });
    }
  };

  const runAiAnalysis = async (productId: string) => {
    setAiAnalyzingId(productId);
    try {
      const data = await analyzeMutation.mutateAsync({ productId });
      setAiResults((prev) => ({ ...prev, [productId]: data }));
      const methodLabel = data.method === 'ai' ? 'Gemini Vision' : '룰 기반';
      toast.success(`${data.grade}등급 (${data.overallScore}점) — ${methodLabel} 분석 완료`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI 분석 실패');
    } finally {
      setAiAnalyzingId(null);
    }
  };

  return {
    aiResults,
    aiAnalyzingId,
    wingRegisteringIds,
    editJobsPending: editJobsMutation.isPending,
    setAiResults,
    mergeAiResults,
    editSingle,
    editBatch,
    selectCandidate,
    markApplied,
    skipGeneration,
    cancelGeneration,
    deleteGeneration,
    openCoupangEdit,
    runAiAnalysis,
  };
}

export type ThumbnailActions = ReturnType<typeof useThumbnailActions>;
