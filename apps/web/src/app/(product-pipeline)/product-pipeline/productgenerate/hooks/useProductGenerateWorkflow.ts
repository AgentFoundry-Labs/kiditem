'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/api-error';
import { apiClient } from '@/lib/api-client';
import { cancelOperation } from '@/lib/operation-cancellation';
import { queryKeys } from '@/lib/query-keys';
import {
  collectedProductDetailHref,
  COLLECTED_PRODUCTS_ROOT,
} from '../../_shared/lib/product-pipeline-routes';
import { useGenerateForm, type GenerateTemplateId } from '../../detail-template-generation/hooks/useGenerateForm';
import { buildProductGenerationPayload } from '../lib/product-generation-payload';

interface ProductGenerationResponse {
  ok: boolean;
  candidateId: string;
  href: string;
  parentOperationKey: string;
  detailGenerationId: string | null;
  thumbnailGenerationId: string | null;
  contentWorkspaceId: string | null;
}

export function useProductGenerateWorkflow() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [templateId, setTemplateId] = useState<GenerateTemplateId>('bold-vertical');
  const [isRegisteringCandidate, setIsRegisteringCandidate] = useState(false);
  const [createdCandidateId, setCreatedCandidateId] = useState<string | null>(null);
  const form = useGenerateForm({
    successDescription: '생성 요청 후 수집 상품 화면에서 진행 상태를 확인할 수 있습니다.',
  });

  const handleSubmit = async (selectedTemplateId: GenerateTemplateId, thumbnailUrls: string[]) => {
    const title = form.rawTitle.trim();
    if (!title) {
      form.setError('상품명을 먼저 입력해 주세요.');
      return;
    }
    if (form.images.length === 0) {
      form.setError('상품 이미지를 1장 이상 추가해 주세요.');
      return;
    }

    setIsRegisteringCandidate(true);
    form.setError(null);
    try {
      const response = await apiClient.post<ProductGenerationResponse>(
        '/api/sourcing/product-generation',
        buildProductGenerationPayload({
          title,
          category: form.rawCategory,
          keyword: form.keyword,
          target: form.target,
          description: form.rawDescription,
          thumbnailUrls,
          imageUrls: form.images,
          rawOptions: form.rawOptions,
          templateId: selectedTemplateId,
          ageGroup: form.ageGroup,
          detailImageCount: form.detailImageCount,
          usageSectionMode: form.usageSectionMode,
          kcCertificationStatus: form.kcCertificationStatus,
          kcCertificationNumber: form.kcCertificationNumber,
          productSize: form.productSize,
          colorVariantStatus: form.colorVariantStatus,
          colorVariantNames: form.colorVariantNames,
          boxSetStatus: form.boxSetStatus,
          boxSetQuantity: form.boxSetQuantity,
        }),
      );
      setCreatedCandidateId(response.candidateId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
      form.openGenerationDialog({
        productName: title,
        templateId: selectedTemplateId,
        operationKey: response.parentOperationKey,
        detailGenerationId: response.detailGenerationId,
        thumbnailGenerationId: response.thumbnailGenerationId,
        editorUrl: collectedProductDetailHref(response.candidateId),
      });
    } catch (err) {
      form.setError(isApiError(err) ? err.detail : '상품 생성 요청에 실패했습니다.');
    } finally {
      setIsRegisteringCandidate(false);
    }
  };

  const handleGenerationDialogAction = async () => {
    const phase = form.generationDialog?.phase;
    const isCompleted = phase === 'completed';
    const candidateId = form.generationDialog?.editorUrl
      ? new URL(form.generationDialog.editorUrl, 'http://kiditem.local').searchParams.get('sourceCandidateId')
      : null;
    const targetCandidateId = candidateId ?? createdCandidateId;
    const targetUrl = targetCandidateId ? collectedProductDetailHref(targetCandidateId) : COLLECTED_PRODUCTS_ROOT;

    form.closeGenerationDialog();

    if (isCompleted) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['kp-generations'] }),
        queryClient.invalidateQueries({ queryKey: ['bold-generations'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all }),
      ]);
    }

    if (isCompleted || phase === 'started') {
      router.push(targetUrl);
    }
  };

  const handleGenerationDialogCancel = async () => {
    const state = form.generationDialog;
    if (!state?.operationKey) return;
    try {
      await cancelOperation({
        targetType: 'operation_key',
        operationKey: state.operationKey,
        reason: '사용자 요청',
      });
      form.markGenerationDialogCancelled();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all }),
        queryClient.invalidateQueries({ queryKey: ['kp-generations'] }),
        queryClient.invalidateQueries({ queryKey: ['bold-generations'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.all }),
      ]);
    } catch (err) {
      form.setError(isApiError(err) ? err.detail : '상품 생성 중단 요청에 실패했습니다.');
    }
  };

  return {
    templateId,
    setTemplateId,
    isRegisteringCandidate,
    form,
    handleSubmit,
    handleGenerationDialogAction,
    handleGenerationDialogCancel,
  };
}
