'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  DetailImageCount,
  DetailPageAgeGroup,
  DetailPageTemplateId,
  ThumbnailGenerationItem,
} from '@kiditem/shared/ai';
import { API_BASE } from '@/lib/api';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { useContentWorkspaceImages } from '../../_shared/hooks/useContentWorkspaceImages';
import {
  collectedProductDetailHref,
  detailPageEditorHref,
  registeredProductDetailHref,
} from '../../_shared/lib/product-pipeline-routes';
import { contentWorkspacesApi } from '../../_shared/lib/content-workspaces-api';
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
  type KidsPlayfulGenerateBody,
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
  operationKey?: string | null;
  generationId?: string;
  detailGenerationId?: string | null;
  thumbnailGenerationId?: string | null;
  editorUrl?: string;
  errorMessage?: string | null;
  description?: string;
}

export interface DuplicateWorkspaceState {
  status: 'idle' | 'checking' | 'none' | 'exists' | 'loaded';
  checkedTitle: string | null;
  workspaceId: string | null;
  workspaceTitle: string | null;
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
  keyword: string;
  target: string;
  features: string[];
  options: string[];
  description: string;
  extraNotes: string;
  estimatedSeconds: number;
}

type GenerateOwnerBindingMode = 'allow-url' | 'sandbox-only';

interface UseGenerateFormOptions {
  successDescription?: string;
  ownerBindingMode?: GenerateOwnerBindingMode;
}

export interface OpenGenerationDialogInput {
  productName: string;
  templateId: GenerateTemplateId;
  operationKey?: string | null;
  detailGenerationId: string | null;
  thumbnailGenerationId: string | null;
  editorUrl: string;
}

interface GenerateSubmitOptions {
  sourceReferences?: NonNullable<KidsPlayfulGenerateBody['sourceReferences']>;
}

export function resolveGenerateOwnerInputs(
  searchParams: URLSearchParams,
  ownerBindingMode: GenerateOwnerBindingMode,
) {
  if (ownerBindingMode === 'sandbox-only') {
    return {
      productId: null,
      initialTitle: '',
      initialContentWorkspaceId: null,
      sourceReferences: [] as NonNullable<KidsPlayfulGenerateBody['sourceReferences']>,
      primarySourceCandidateId: null,
    };
  }

  const productId = searchParams.get('productId');
  const initialTitle = searchParams.get('title') ?? '';
  const initialContentWorkspaceId = searchParams.get('contentWorkspaceId');
  const sourceReferences = getGenerateSourceReferences(searchParams, productId);
  const primarySourceCandidateId =
    sourceReferences.find((reference) => reference.sourceType === 'sourcing_candidate')
      ?.sourceCandidateId ?? null;

  return {
    productId,
    initialTitle,
    initialContentWorkspaceId,
    sourceReferences,
    primarySourceCandidateId,
  };
}

export function useGenerateForm(options: UseGenerateFormOptions = {}) {
  const searchParams = useSearchParams();
  const {
    productId,
    initialTitle,
    initialContentWorkspaceId,
    sourceReferences,
    primarySourceCandidateId,
  } = resolveGenerateOwnerInputs(
    new URLSearchParams(searchParams.toString()),
    options.ownerBindingMode ?? 'allow-url',
  );
  const detailPageMutation = useKidsPlayfulGenerate();

  const [rawTitle, setRawTitle] = useState(initialTitle);
  const [rawCategory, setRawCategory] = useState('');
  const [keyword, setKeyword] = useState('');
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
  const [duplicateWorkspace, setDuplicateWorkspace] = useState<DuplicateWorkspaceState>({
    status: initialContentWorkspaceId && initialTitle ? 'loaded' : 'idle',
    checkedTitle: initialContentWorkspaceId && initialTitle ? initialTitle : null,
    workspaceId: initialContentWorkspaceId,
    workspaceTitle: initialContentWorkspaceId && initialTitle ? initialTitle : null,
  });
  const { images: savedImages, loading: imagesLoading } = useContentWorkspaceImages(
    duplicateWorkspace.workspaceId,
  );
  const generationStatusQuery = useKidsPlayfulOne(
    generationDialog?.generationId ?? null,
  );
  const thumbnailStatusQuery = useQuery({
    queryKey: ['thumbnail-generation', generationDialog?.thumbnailGenerationId ?? 'noop'],
    queryFn: () =>
      apiClient.get<ThumbnailGenerationItem>(
        `/api/thumbnail-analysis/generations/${generationDialog?.thumbnailGenerationId}`,
      ),
    enabled: Boolean(generationDialog?.open && generationDialog.thumbnailGenerationId),
    refetchInterval: (query) => {
      const item = query.state.data;
      return item?.status === 'pending' || item?.status === 'running' ? 2500 : false;
    },
  });

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
      if (prev.thumbnailGenerationId) return prev;
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

  useEffect(() => {
    setGenerationDialog((prev) => {
      if (!prev?.open) return prev;
      const nextPhase = resolveProductGenerationDialogPhase({
        currentPhase: prev.phase,
        detailGenerationId: prev.detailGenerationId ?? prev.generationId ?? null,
        detail: generationStatusQuery.data,
        thumbnailGenerationId: prev.thumbnailGenerationId ?? null,
        thumbnail: thumbnailStatusQuery.data,
      });
      if (!nextPhase || prev.phase === nextPhase) return prev;
      return { ...prev, phase: nextPhase };
    });
  }, [generationStatusQuery.data, thumbnailStatusQuery.data]);

  const requestPrefill = async (title: string, orderedImages: string[]) =>
    apiClient.post<DetailPagePrefillResult>('/api/ai/detail-page/prefill', {
      rawTitle: title,
      imageUrls: orderedImages,
    });

  const handleDuplicateCheck = async () => {
    const title = rawTitle.trim();
    if (!title) {
      setError('상품명을 먼저 입력해 주세요.');
      return;
    }
    if (!isValidProductTitle(title)) {
      setError('상품명은 한글, 영문, 숫자, 공백만 사용할 수 있습니다.');
      return;
    }
    setDuplicateWorkspace({
      status: 'checking',
      checkedTitle: title,
      workspaceId: null,
      workspaceTitle: null,
    });
    setError(null);
    try {
      const result = await contentWorkspacesApi.checkDuplicate(title);
      if (!result.exists || !result.workspace) {
        setDuplicateWorkspace({
          status: 'none',
          checkedTitle: title,
          workspaceId: null,
          workspaceTitle: null,
        });
        toast.success('같은 상품명의 기존 이력이 없습니다.');
        return;
      }
      setDuplicateWorkspace({
        status: 'exists',
        checkedTitle: title,
        workspaceId: result.workspace.id,
        workspaceTitle: result.workspace.displayName,
      });
      toast.info('같은 상품명의 기존 이력이 있습니다.');
    } catch (err) {
      setDuplicateWorkspace({
        status: 'idle',
        checkedTitle: title,
        workspaceId: null,
        workspaceTitle: null,
      });
      setError(isApiError(err) ? err.detail : '상품명 중복 확인에 실패했습니다.');
    }
  };

  const handleLoadDuplicateLatest = async () => {
    const workspaceId = duplicateWorkspace.workspaceId;
    if (!workspaceId) return;
    if (!window.confirm('기존 최신 이력을 불러와 현재 입력값을 채울까요?')) return;
    try {
      const workspace = await contentWorkspacesApi.get(workspaceId);
      const latest = workspace.history[0]?.generationInput;
      const input = latest && typeof latest === 'object'
        ? latest as Record<string, unknown>
        : {};
      setRawTitle(pickString(input.rawTitle) ?? workspace.displayName);
      setRawCategory(pickString(input.rawCategory) ?? '');
      setRawDescription(pickString(input.rawDescription) ?? '');
      setRawOptions(pickString(input.rawOptions) ?? '');
      setImages(Array.isArray(input.imageUrls)
        ? moveSafetyLabelImagesToEnd(input.imageUrls.filter(isNonEmptyString)).slice(0, 15)
        : []);
      if (input.ageGroup === 'age-14-plus' || input.ageGroup === 'age-8-plus') {
        setAgeGroup(input.ageGroup);
      }
      if (isDetailImageCount(input.detailImageCount)) {
        setDetailImageCount(input.detailImageCount);
      }
      if (input.usageSectionMode === 'include' || input.usageSectionMode === 'exclude') {
        setUsageSectionMode(input.usageSectionMode);
      }
      if (
        input.kcCertificationStatus === 'unknown' ||
        input.kcCertificationStatus === 'none' ||
        input.kcCertificationStatus === 'exists'
      ) {
        setKcCertificationStatus(input.kcCertificationStatus);
      }
      setKcCertificationNumber(pickString(input.kcCertificationNumber) ?? '');
      setDuplicateWorkspace({
        status: 'loaded',
        checkedTitle: workspace.displayName,
        workspaceId: workspace.id,
        workspaceTitle: workspace.displayName,
      });
      toast.success('기존 최신 이력을 불러왔습니다.');
    } catch (err) {
      setError(isApiError(err) ? err.detail : '기존 이력을 불러오지 못했습니다.');
    }
  };

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
      const aiKeyword = data.keyword?.trim();
      if (aiKeyword) {
        setKeyword(aiKeyword);
        toast.success(`AI 채움: 카테고리 "${data.category}" / 키워드 "${aiKeyword}"`);
      } else {
        toast.success('AI가 카테고리와 핵심 정보를 채웠어요');
      }
    } catch (err) {
      setError(isApiError(err) ? err.detail : 'AI 내용 채우기에 실패했습니다.');
    } finally {
      setIsPrefilling(false);
    }
  };

  const handleSubmit = async (
    selectedTemplateId: GenerateTemplateId,
    submitOptions: GenerateSubmitOptions = {},
  ) => {
    const title = rawTitle.trim();
    const orderedImages = moveSafetyLabelImagesToEnd(images);
    if (!isValidProductTitle(title)) {
      setError('상품명은 한글, 영문, 숫자, 공백만 사용할 수 있습니다.');
      return;
    }
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
          if (prefill.keyword) {
            setKeyword((prev) => prev || prefill.keyword);
          }
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
        contentWorkspaceId: getLoadedContentWorkspaceId(duplicateWorkspace, title) ?? undefined,
        templateId: apiTemplateId,
        sourceReferences: mergeSourceReferences(sourceReferences, submitOptions.sourceReferences ?? []),
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
        description: options.successDescription ?? '완료되면 알림에서 에디터로 이동할 수 있습니다.',
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

  const markGenerationDialogCancelled = (message = '사용자 요청으로 생성이 중단되었습니다.') => {
    setGenerationDialog((prev) =>
      prev
        ? {
            ...prev,
            phase: 'cancelled',
            errorMessage: message,
          }
        : prev,
    );
  };

  const openGenerationDialog = (input: OpenGenerationDialogInput) => {
    const startedAt = new Date().toISOString();
    setGenerationStartedAt(startedAt);
    setGenerationDialog({
      open: true,
      phase: 'started',
      startedAt,
      productName: input.productName,
      templateId: input.templateId,
      operationKey: input.operationKey ?? null,
      detailGenerationId: input.detailGenerationId,
      thumbnailGenerationId: input.thumbnailGenerationId,
      generationId: input.detailGenerationId ?? undefined,
      editorUrl: input.editorUrl,
      errorMessage: null,
      description: '상품 작업공간을 만들고 상세페이지와 썸네일 생성을 시작했습니다.',
    });
  };

  return {
    rawTitle,
    setRawTitle,
    rawCategory,
    setRawCategory,
    keyword,
    setKeyword,
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
    markGenerationDialogCancelled,
    openGenerationDialog,
    handlePrefill,
    duplicateWorkspace,
    handleDuplicateCheck,
    handleLoadDuplicateLatest,
    handleSubmit,
  };
}

function generationStatusToDialogPhase(
  status: KidsPlayfulGenerationItem['imageProcessingStatus'] | undefined,
): GenerationDialogPhase | null {
  if (status === 'pending' || status === 'processing') return 'started';
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  return null;
}

function thumbnailStatusToDialogPhase(
  status: ThumbnailGenerationItem['status'] | undefined,
): GenerationDialogPhase | null {
  if (status === 'pending' || status === 'running') return 'started';
  if (status === 'succeeded') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  return null;
}

function resolveProductGenerationDialogPhase(input: {
  currentPhase: GenerationDialogPhase;
  detailGenerationId: string | null;
  detail?: KidsPlayfulGenerationItem;
  thumbnailGenerationId: string | null;
  thumbnail?: ThumbnailGenerationItem;
}): GenerationDialogPhase | null {
  if (input.currentPhase === 'cancelled') return null;

  const detailPhase = input.detailGenerationId
    ? generationStatusToDialogPhase(input.detail?.imageProcessingStatus)
    : 'completed';
  const thumbnailPhase = input.thumbnailGenerationId
    ? thumbnailStatusToDialogPhase(input.thumbnail?.status)
    : 'completed';

  if (detailPhase === 'failed' || thumbnailPhase === 'failed') return 'failed';
  if (detailPhase === 'cancelled' || thumbnailPhase === 'cancelled') return 'cancelled';
  if (detailPhase === 'completed' && thumbnailPhase === 'completed') return 'completed';
  if (detailPhase === 'started' || thumbnailPhase === 'started') return 'started';
  return null;
}

function buildGenerationEditorUrl(
  item: KidsPlayfulGenerationItem,
  sourceCandidateId?: string | null,
): string | undefined {
  const candidateId = item.sourceCandidateId ?? sourceCandidateId ?? null;
  const contentWorkspaceId = item.contentWorkspaceId ?? null;
  const returnTo = candidateId
    ? collectedProductDetailHref(candidateId)
    : contentWorkspaceId
      ? registeredProductDetailHref(contentWorkspaceId)
      : null;
  if (candidateId) {
    return detailPageEditorHref({ candidateId, generationId: item.id, returnTo });
  }
  return detailPageEditorHref({ generationId: item.id, returnTo });
}

function mergeSourceReferences(
  base: NonNullable<KidsPlayfulGenerateBody['sourceReferences']>,
  extra: NonNullable<KidsPlayfulGenerateBody['sourceReferences']>,
): NonNullable<KidsPlayfulGenerateBody['sourceReferences']> {
  const seen = new Set<string>();
  const merged: NonNullable<KidsPlayfulGenerateBody['sourceReferences']> = [];
  for (const ref of [...base, ...extra]) {
    const key = [
      ref.sourceType,
      ref.sourceCandidateId ?? '',
      ref.contentAssetId ?? '',
      ref.sourceContentGenerationId ?? '',
      ref.label ?? '',
    ].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(ref);
  }
  return merged;
}

export function getLoadedContentWorkspaceId(
  duplicateWorkspace: DuplicateWorkspaceState,
  title: string,
): string | null {
  if (duplicateWorkspace.status !== 'loaded' || !duplicateWorkspace.workspaceId) return null;
  if (!duplicateWorkspace.checkedTitle) return null;
  return normalizeContentTitle(duplicateWorkspace.checkedTitle) === normalizeContentTitle(title)
    ? duplicateWorkspace.workspaceId
    : null;
}

function normalizeContentTitle(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function isValidProductTitle(value: string): boolean {
  return /^[\p{L}\p{N}\s]+$/u.test(value);
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isDetailImageCount(value: unknown): value is DetailImageCount {
  return value === '2' || value === '3' || value === '4' || value === '5' || value === '6';
}
