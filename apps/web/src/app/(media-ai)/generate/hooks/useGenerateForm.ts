'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import type {
  DetailImageCount,
  DetailPageAgeGroup,
  DetailPageTemplateId,
} from '@kiditem/shared/ai';
import { API_BASE } from '@/lib/api';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { useProductImages } from '@/hooks/useProductImages';
import { moveSafetyLabelImagesToEnd } from '../lib/detail-page-image-order';
import {
  buildAgeGroupInstruction,
  buildBoxSetInstruction,
  buildColorVariantInstruction,
  buildDetailImageCountInstruction,
  buildKcCertificationInstruction,
  buildUsageSectionInstruction,
  normalizeKcCertificationNumber,
} from '../lib/detail-page-generation-instructions';
import {
  hasImageUrlChanges,
  prepareGenerationImageUrls,
} from '../lib/detail-page-generation-images';
import type {
  BoxSetStatus,
  ColorVariantStatus,
  KcCertificationStatus,
  UsageSectionMode,
} from '../lib/detail-page-generation-options';
import { getGenerateSourceReferences } from '../lib/detail-page-source-references';
import {
  type KidsPlayfulGenerationItem,
  useKidsPlayfulGenerate,
  useKidsPlayfulOne,
} from './useKidsPlayfulGenerate';

export type GenerateTemplateId = DetailPageTemplateId;
export type { DetailImageCount, DetailPageAgeGroup } from '@kiditem/shared/ai';
export type {
  BoxSetStatus,
  ColorVariantStatus,
  KcCertificationStatus,
  UsageSectionMode,
} from '../lib/detail-page-generation-options';
export { getGenerateSourceReferences } from '../lib/detail-page-source-references';
const TITLE_REQUIRED_MESSAGE = '상품명을 먼저 입력해 주세요.';
export const IMAGE_REQUIRED_MESSAGE = '상품 이미지를 최소 1장 추가해 주세요.';

export type GenerationDialogPhase =
  | 'submitting'
  | 'started'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface GenerationDialogState {
  open: boolean;
  phase: GenerationDialogPhase;
  startedAt: string;
  productName: string;
  templateId: GenerateTemplateId;
  generationId?: string;
  editorUrl?: string;
  errorMessage?: string | null;
}

export function getGenerateFormValidation(input: {
  rawTitle: string;
  imageCount: number;
}): { isValid: boolean; message: string | null } {
  if (input.rawTitle.trim() === '') {
    return { isValid: false, message: TITLE_REQUIRED_MESSAGE };
  }
  if (input.imageCount < 1) {
    return { isValid: false, message: IMAGE_REQUIRED_MESSAGE };
  }
  return { isValid: true, message: null };
}

interface DetailPagePrefillResult {
  category: string;
  target: string;
  features: string[];
  options: string[];
  description: string;
  extraNotes: string;
  estimatedSeconds: number;
}

export function useGenerateForm() {
  const searchParams = useSearchParams();
  const productId = searchParams.get('productId');
  const sourceReferences = getGenerateSourceReferences(searchParams, productId);
  const primarySourceCandidateId =
    sourceReferences.find((reference) => reference.sourceType === 'sourcing_candidate')
      ?.sourceCandidateId ?? null;
  const { images: savedImages, loading: imagesLoading } = useProductImages(productId);
  const detailPageMutation = useKidsPlayfulGenerate();

  const [rawTitle, setRawTitle] = useState('');
  const [rawCategory, setRawCategory] = useState('');
  const [target, setTarget] = useState('');
  const [ageGroup, setAgeGroup] = useState<DetailPageAgeGroup>('age-8-plus');
  const [detailImageCount, setDetailImageCount] = useState<DetailImageCount>('2');
  const [usageSectionMode, setUsageSectionMode] = useState<UsageSectionMode>('include');
  const [kcCertificationStatus, setKcCertificationStatus] = useState<KcCertificationStatus>('unknown');
  const [kcCertificationNumber, setKcCertificationNumber] = useState('');
  const [rawDescription, setRawDescription] = useState('');
  const [productSize, setProductSize] = useState('');
  const [boxSetStatus, setBoxSetStatus] = useState<BoxSetStatus>('auto');
  const [boxSetQuantity, setBoxSetQuantity] = useState('');
  const [colorVariantStatus, setColorVariantStatus] = useState<ColorVariantStatus>('auto');
  const [colorVariantNames, setColorVariantNames] = useState('');
  const [rawOptions, setRawOptions] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPrefilling, setIsPrefilling] = useState(false);
  const [generationStartedAt, setGenerationStartedAt] = useState<string | null>(null);
  const [generationDialog, setGenerationDialog] = useState<GenerationDialogState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generationStatusQuery = useKidsPlayfulOne(
    generationDialog?.generationId ?? null,
  );

  useEffect(() => {
    if (savedImages.length === 0) return;
    const valid = savedImages
      .map((img) => img.url)
      .filter((url) => url.trim() !== '')
      .map((url) => (url.startsWith('/') ? `${API_BASE}${url}` : url));
    if (valid.length > 0) setImages(moveSafetyLabelImagesToEnd(valid).slice(0, 15));
  }, [savedImages]);

  const formValidation = getGenerateFormValidation({
    rawTitle,
    imageCount: images.length,
  });
  const isFormValid = formValidation.isValid;

  useEffect(() => {
    const item = generationStatusQuery.data;
    if (!item) return;
    const phase = generationStatusToDialogPhase(item.imageProcessingStatus);
    if (!phase) return;

    setGenerationDialog((prev) => {
      if (!prev?.open || prev.generationId !== item.id) return prev;
      const editorUrl = buildGenerationEditorUrl(item, primarySourceCandidateId);
      if (
        prev.phase === phase &&
        prev.editorUrl === editorUrl &&
        prev.errorMessage === item.imageProcessingError
      ) {
        return prev;
      }
      return {
        ...prev,
        phase,
        productName: item.productName || prev.productName,
        editorUrl,
        errorMessage: item.imageProcessingError,
      };
    });
  }, [generationStatusQuery.data, primarySourceCandidateId]);

  const requestPrefill = async (title: string, orderedImages: string[]) =>
    apiClient.post<DetailPagePrefillResult>('/api/ai/detail-page/prefill', {
      rawTitle: title,
      imageUrls: orderedImages,
    });

  const handlePrefill = async () => {
    const title = rawTitle.trim();
    if (!title) {
      setError('상품명을 먼저 입력해 주세요.');
      return;
    }
    setIsPrefilling(true);
    setError(null);
    try {
      const data = await requestPrefill(title, moveSafetyLabelImagesToEnd(images));
      setRawCategory(data.category);
      setTarget(data.target);
      setRawDescription(data.description);
      toast.success('AI가 카테고리와 핵심 정보를 채웠어요');
    } catch (err) {
      setError(isApiError(err) ? err.detail : 'AI 내용 채우기에 실패했습니다.');
    } finally {
      setIsPrefilling(false);
    }
  };

  const handleSubmit = async (selectedTemplateId: GenerateTemplateId) => {
    const title = rawTitle.trim();
    const orderedImages = moveSafetyLabelImagesToEnd(images);
    const validation = getGenerateFormValidation({
      rawTitle: title,
      imageCount: orderedImages.length,
    });
    if (!validation.isValid) {
      setError(validation.message);
      if (validation.message === IMAGE_REQUIRED_MESSAGE) {
        toast.error(IMAGE_REQUIRED_MESSAGE);
      }
      return;
    }

    const startedAt = new Date().toISOString();
    setIsLoading(true);
    setGenerationStartedAt(startedAt);
    setGenerationDialog({
      open: true,
      phase: 'submitting',
      startedAt,
      productName: title,
      templateId: selectedTemplateId,
    });
    setError(null);
    try {
      const generationImages = await prepareGenerationImageUrls(orderedImages);
      if (hasImageUrlChanges(orderedImages, generationImages)) {
        setImages(generationImages.slice(0, 15));
      }
      const apiTemplateId = selectedTemplateId === 'kids-playful' ? 'kids-playful' : 'bold-vertical';
      let category = rawCategory.trim();
      let generationTarget = target.trim();
      let descriptionText = rawDescription.trim();
      let optionsText = rawOptions.trim();

      if (!category || !descriptionText) {
        try {
          const prefill = await requestPrefill(title, generationImages);
          category ||= prefill.category;
          generationTarget ||= prefill.target;
          descriptionText ||= prefill.description;
          optionsText ||= prefill.options.join('\n');
          setRawCategory((prev) => prev || prefill.category);
          setTarget((prev) => prev || prefill.target);
          setRawDescription((prev) => prev || prefill.description);
        } catch (prefillErr) {
          console.warn('[generate] auto-prefill failed, using defaults', prefillErr);
          toast.warning('AI 자동 채움에 실패해 기본값으로 진행합니다.', {
            description: '카테고리와 특징을 직접 입력하면 더 정확합니다.',
          });
          category ||= '키즈 상품';
          generationTarget ||= '부모 구매자';
          descriptionText ||= `${title}의 특징을 업로드한 상품 이미지를 기준으로 분석해 상세페이지 카피를 작성해 주세요.`;
        }
      }

      category ||= '키즈 상품';
      generationTarget ||= '부모 구매자';
      const ageGroupInstruction = buildAgeGroupInstruction(ageGroup);
      const detailImageCountInstruction = buildDetailImageCountInstruction(detailImageCount);
      const usageSectionInstruction = buildUsageSectionInstruction(usageSectionMode);
      const kcCertificationInstruction = buildKcCertificationInstruction(
        kcCertificationStatus,
        kcCertificationNumber,
      );
      const boxSetInstruction = buildBoxSetInstruction(boxSetStatus, boxSetQuantity);
      const colorVariantInstruction = buildColorVariantInstruction(
        colorVariantStatus,
        colorVariantNames,
      );
      const optionsForPrompt = [
        optionsText,
        productSize.trim() ? `제품 사이즈: ${productSize.trim()}` : '',
        ageGroupInstruction,
        detailImageCountInstruction,
        usageSectionInstruction,
        kcCertificationInstruction,
        colorVariantInstruction,
        boxSetInstruction,
      ].filter(Boolean).join('\n');
      const description = [
        `카테고리: ${category}`,
        `주요 타겟: ${generationTarget}`,
        ageGroupInstruction,
        detailImageCountInstruction,
        usageSectionInstruction,
        kcCertificationInstruction,
        productSize.trim() ? `제품 사이즈: ${productSize.trim()}` : '',
        colorVariantInstruction,
        boxSetInstruction,
        `특징: ${descriptionText}`,
      ].filter(Boolean).join('\n');

      const generated = await detailPageMutation.mutateAsync({
        rawTitle: title,
        rawCategory: category,
        rawDescription: description,
        rawOptions: optionsForPrompt,
        imageUrls: generationImages,
        heroImageMode: 'llm-pick',
        productId: productId ?? undefined,
        templateId: apiTemplateId,
        sourceReferences,
        ageGroup,
        detailImageCount,
        usageSectionMode,
        kcCertificationStatus,
        kcCertificationNumber: normalizeKcCertificationNumber(kcCertificationNumber),
      });
      const nextPhase = generationStatusToDialogPhase(generated.imageProcessingStatus) ?? 'started';
      setGenerationDialog((prev) =>
        prev
          ? {
              ...prev,
              phase: nextPhase,
              generationId: generated.id,
              editorUrl: buildGenerationEditorUrl(generated, primarySourceCandidateId),
              errorMessage: generated.imageProcessingError,
            }
          : {
              open: true,
              phase: nextPhase,
              startedAt,
              productName: title,
              templateId: selectedTemplateId,
              generationId: generated.id,
              editorUrl: buildGenerationEditorUrl(generated, primarySourceCandidateId),
              errorMessage: generated.imageProcessingError,
            },
      );
      toast.success('상세페이지 생성을 시작했습니다.', {
        description: '완료되면 알림에서 에디터로 이동할 수 있습니다.',
      });
    } catch (err) {
      setError(isApiError(err) ? err.detail : '상세페이지 생성 중 오류가 발생했습니다.');
      setGenerationDialog(null);
    } finally {
      setIsLoading(false);
      setGenerationStartedAt(null);
    }
  };

  const closeGenerationDialog = () => {
    setGenerationDialog(null);
  };

  return {
    rawTitle,
    setRawTitle,
    rawCategory,
    setRawCategory,
    target,
    setTarget,
    ageGroup,
    setAgeGroup,
    detailImageCount,
    setDetailImageCount,
    usageSectionMode,
    setUsageSectionMode,
    kcCertificationStatus,
    setKcCertificationStatus,
    kcCertificationNumber,
    setKcCertificationNumber,
    rawDescription,
    setRawDescription,
    productSize,
    setProductSize,
    boxSetStatus,
    setBoxSetStatus,
    boxSetQuantity,
    setBoxSetQuantity,
    colorVariantStatus,
    setColorVariantStatus,
    colorVariantNames,
    setColorVariantNames,
    rawOptions,
    setRawOptions,
    images,
    setImages,
    isLoading,
    error,
    setError,
    isFormValid,
    imagesLoading,
    isPrefilling,
    generationStartedAt,
    generationDialog,
    closeGenerationDialog,
    handlePrefill,
    handleSubmit,
  };
}

function generationStatusToDialogPhase(
  status: KidsPlayfulGenerationItem['imageProcessingStatus'],
): GenerationDialogPhase | null {
  if (status === 'pending' || status === 'processing') return 'started';
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  return null;
}

function buildGenerationEditorUrl(
  item: KidsPlayfulGenerationItem,
  sourceCandidateId?: string | null,
): string | undefined {
  if (sourceCandidateId) {
    return `/sourcing/${encodeURIComponent(sourceCandidateId)}/editor?generationId=${encodeURIComponent(item.id)}`;
  }
  return `/sourcing/detail-pages/${encodeURIComponent(item.id)}/editor`;
}
