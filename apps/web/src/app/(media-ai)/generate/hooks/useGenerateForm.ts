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
  type KidsPlayfulGenerationItem,
  useKidsPlayfulGenerate,
  useKidsPlayfulOne,
} from './useKidsPlayfulGenerate';

export type GenerateTemplateId = DetailPageTemplateId;
export type { DetailImageCount, DetailPageAgeGroup } from '@kiditem/shared/ai';
export type UsageSectionMode = 'include' | 'exclude';
export type KcCertificationStatus = 'unknown' | 'none' | 'exists';
export type BoxSetStatus = 'auto' | 'none' | 'box' | 'set' | 'exists';
export type ColorVariantStatus = 'auto' | 'none' | 'single' | 'multiple';
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
      const editorUrl = buildGenerationEditorUrl(item);
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
  }, [generationStatusQuery.data]);

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
      const apiTemplateId = selectedTemplateId === 'kids-playful' ? 'kids-playful' : 'bold-vertical';
      let category = rawCategory.trim();
      let generationTarget = target.trim();
      let descriptionText = rawDescription.trim();
      let optionsText = rawOptions.trim();

      if (!category || !descriptionText) {
        try {
          const prefill = await requestPrefill(title, orderedImages);
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
        imageUrls: orderedImages,
        heroImageMode: 'llm-pick',
        productId: productId ?? undefined,
        templateId: apiTemplateId,
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
              editorUrl: buildGenerationEditorUrl(generated),
              errorMessage: generated.imageProcessingError,
            }
          : {
              open: true,
              phase: nextPhase,
              startedAt,
              productName: title,
              templateId: selectedTemplateId,
              generationId: generated.id,
              editorUrl: buildGenerationEditorUrl(generated),
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

function buildAgeGroupInstruction(ageGroup: DetailPageAgeGroup): string {
  if (ageGroup === 'age-14-plus') {
    return [
      '사용 연령 기준: 14세 이상 상품',
      '문구와 이미지의 실제 사용자는 아이가 아니라 중고등학생/청소년/학생으로 표현하세요.',
      '유아·어린아이·초등 저학년처럼 보이는 장면, 말투, 모델은 피하세요.',
    ].join('\n');
  }

  return [
    '사용 연령 기준: 8세 이상 상품',
    '문구와 이미지의 실제 사용자는 8세 이상 어린이/초등학생 기준으로 표현하세요.',
    '유아·영아처럼 너무 어린 장면은 피하세요.',
  ].join('\n');
}

function buildDetailImageCountInstruction(detailImageCount: DetailImageCount): string {
  return `DETAIL 이미지 수: ${detailImageCount}개`;
}

function buildUsageSectionInstruction(usageSectionMode: UsageSectionMode): string {
  if (usageSectionMode === 'exclude') {
    return [
      '사용법 영역: 만들지 않음',
      '상세페이지에 사용법 안내/사용 순서/튜토리얼 섹션을 만들지 마세요.',
      'BoldVertical 출력에서는 usage.subtitle는 빈 문자열, usage.imageIndices는 빈 배열로 두세요.',
      '사용법 전용 이미지는 생성하지 말고 DETAIL 본문 이미지만 구성하세요.',
    ].join('\n');
  }

  return [
    '사용법 영역: 포함',
    '실제 사용 흐름이 필요한 상품이면 사용법 안내 섹션을 만드세요.',
    '사용법/설명서 이미지가 있으면 usage 영역에 분리하세요.',
  ].join('\n');
}

function buildKcCertificationInstruction(
  status: KcCertificationStatus,
  number: string,
): string {
  const kcNumber = normalizeKcCertificationNumber(number);
  if (status === 'none') {
    return [
      'KC 인증번호: 없음',
      'KC 번호를 추정해서 만들지 마세요.',
      '안전표시/KC/바코드 이미지가 있으면 제품정보 표를 만들지 말고 하단 이미지로 처리하세요.',
    ].join('\n');
  }
  if (status === 'exists') {
    return [
      kcNumber ? `KC 인증번호: ${kcNumber}` : 'KC 인증번호: 있음',
      '안전표시/KC/바코드 이미지가 있으면 제품정보 표와 중복하지 마세요.',
      kcNumber
        ? '안전표시/KC/바코드 이미지가 없을 때 제품정보 표에 KC 인증번호 항목을 추가하세요.'
        : '이미지나 원문에서 번호가 확인될 때만 제품정보 표에 KC 인증번호 항목을 추가하세요.',
    ].join('\n');
  }
  return [
    'KC 인증번호: AI가 원본 설명과 이미지로 판단',
    '안전표시/KC/바코드 이미지가 있으면 제품정보 표와 중복하지 마세요.',
  ].join('\n');
}

function normalizeKcCertificationNumber(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 80);
}

function buildBoxSetInstruction(status: BoxSetStatus, quantity: string): string {
  const count = formatBoxSetQuantity(quantity);
  if (status === 'none') {
    return [
      '박스/세트 정보: 없음',
      '박스/세트 구분: 없음',
      '박스 또는 세트 포장 근거가 없으므로 1박스/세트 구성 문구와 패키지 섹션을 생성하지 마세요.',
    ].join('\n');
  }
  if (status === 'box' || status === 'exists') {
    return [
      '박스/세트 정보: 있음',
      '박스/세트 구분: 박스',
      count ? `1박스 수량: ${count}개입` : '',
      '업로드 이미지에서 박스 또는 패키지 구성 이미지가 확인되면 패키지 섹션을 만들고, 없으면 텍스트만으로 상품 이미지를 생성하지 마세요.',
      'packageLabel은 박스일 때 "1박스 N개입 구성" 또는 "박스 구성"처럼 쓰고 세트라고 부르지 마세요.',
    ].filter(Boolean).join('\n');
  }
  if (status === 'set') {
    return [
      '박스/세트 정보: 있음',
      '박스/세트 구분: 세트',
      count ? `세트 수량: ${count}개 구성` : '',
      '업로드 이미지에서 세트 구성품 이미지가 확인되면 패키지 섹션을 만들고, 없으면 텍스트만으로 상품 이미지를 생성하지 마세요.',
      'packageLabel은 세트일 때 "N개 세트 구성" 또는 "세트 구성"처럼 쓰고 1박스라고 부르지 마세요.',
    ].join('\n');
  }
  return [
    '박스/세트 정보: AI가 업로드 이미지와 원본 설명으로 판단',
    '박스/세트 구분: AI 판단',
    '박스가 보이면 박스, 여러 구성품 묶음만 보이면 세트로 구분하세요.',
    '박스/세트 포장 또는 구성 수량 근거가 보일 때만 1박스/세트 구성 섹션을 만들고, 근거가 없으면 생성하지 마세요.',
  ].join('\n');
}

function buildColorVariantInstruction(
  status: ColorVariantStatus,
  colorNames: string,
): string {
  const names = formatColorVariantNames(colorNames);
  if (status === 'single') {
    return [
      names ? `색상 구성: 단일 색상 (${names})` : '색상 구성: 단일 색상',
      '색상 안내 섹션은 단일 색상 기준으로 만들고, 이미지에 없는 다른 색상을 상상해서 추가하지 마세요.',
    ].join('\n');
  }
  if (status === 'none') {
    return [
      '색상 구성: 없음',
      '색상 안내 섹션을 만들지 말고 color.subtitle는 빈 문자열, color.imageIndices는 빈 배열로 두세요.',
    ].join('\n');
  }
  if (status === 'multiple') {
    return [
      names ? `색상 구성: 여러 색상 (${names})` : '색상 구성: 여러 색상',
      '색상별 단독 상품 이미지가 각각 있으면 각각 배치하고, 한 이미지에 색상이 모여 있으면 그 비교컷 1장만 사용하세요.',
      '박스/배경/KC 라벨 색은 색상으로 세지 말고 실제 상품 본체 색상만 기준으로 판단하세요.',
    ].join('\n');
  }
  return [
    '색상 구성: AI가 업로드 이미지로 판단',
    names ? `색상명 힌트: ${names}` : '',
    '실제 상품 이미지에서 여러 색상이 확인될 때만 여러 색상으로 만들고, 단일 색상이면 단일 색상으로 표시하세요.',
    '색상별 단독컷이 없고 합쳐진 이미지뿐이면 색상 안내 이미지는 1장만 사용하세요.',
  ].filter(Boolean).join('\n');
}

function formatBoxSetQuantity(quantity: string): string {
  const trimmed = quantity.trim();
  if (!trimmed) return '';
  const numberOnly = trimmed.match(/\d+/)?.[0];
  return numberOnly || trimmed.replace(/\s+/g, ' ');
}

function formatColorVariantNames(colorNames: string): string {
  return colorNames
    .split(/[\n,，/]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(' / ');
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

function buildGenerationEditorUrl(item: KidsPlayfulGenerationItem): string | undefined {
  return `/product-content/detail-pages/${encodeURIComponent(item.id)}/editor`;
}
