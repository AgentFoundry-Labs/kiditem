'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/api-error';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import {
  collectedProductDetailHref,
  COLLECTED_PRODUCTS_ROOT,
} from '../../_shared/lib/product-pipeline-routes';
import { useGenerateForm, type GenerateTemplateId } from '../../detail-template-generation/hooks/useGenerateForm';
import { buildProductGenerationPayload } from '../lib/product-generation-payload';

interface ProductGenerationResponse {
  ok: boolean;
  candidateId: string;
  /** 만든 판매상품 초안. 수집상품 화면은 이 id 로 연다(KID-310). */
  salesProductId: string;
  href: string;
  detailPageId: string | null;
  thumbnailGenerationId: string | null;
  contentWorkspaceId: string | null;
}

export async function cancelProductGenerationChildren(input: {
  detailPageId: string | null;
  thumbnailGenerationId: string | null;
}): Promise<void> {
  const cancellations: Promise<unknown>[] = [];
  if (input.detailPageId) {
    cancellations.push(apiClient.post(
      `/api/ai/detail-page/${encodeURIComponent(input.detailPageId)}/cancel`,
      { reason: '사용자 요청' },
    ));
  }
  if (input.thumbnailGenerationId) {
    cancellations.push(apiClient.post(
      `/api/ai/thumbnail-jobs/${encodeURIComponent(input.thumbnailGenerationId)}/cancel`,
      { reason: '사용자 요청' },
    ));
  }
  await Promise.all(cancellations);
}

export function useProductGenerateWorkflow() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [templateId, setTemplateId] = useState<GenerateTemplateId>('bold-vertical');
  const [isRegisteringCandidate, setIsRegisteringCandidate] = useState(false);
  const [createdSalesProductId, setCreatedSalesProductId] = useState<string | null>(null);
  const pendingRequest = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const form = useGenerateForm({
    successDescription: '생성 요청 후 수집 상품 화면에서 진행 상태를 확인할 수 있습니다.',
  });
  const generationDialog = form.generationDialog;

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
      const payload = buildProductGenerationPayload({
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
        salePrice: form.salePrice,
        tagPrice: form.tagPrice,
        costPrice: form.costPrice,
        brand: form.brand,
        manufacturer: form.manufacturer,
        originCountry: form.originCountry,
        modelName: form.modelName,
        ownCode: form.ownCode,
        taxType: form.taxType,
        deliveryFee: form.deliveryFee,
        deliveryFeeType: form.deliveryFeeType,
        certificationIssuer: form.certificationIssuer,
        certificationField: form.certificationField,
      });
      const fingerprint = JSON.stringify(payload);
      const idempotencyKey = pendingRequest.current?.fingerprint === fingerprint
        ? pendingRequest.current.idempotencyKey
        : createSecureRandomUuid();
      pendingRequest.current = { fingerprint, idempotencyKey };
      const response = await apiClient.post<ProductGenerationResponse>(
        '/api/sourcing/product-generation',
        payload,
        { headers: { 'Idempotency-Key': idempotencyKey } },
      );
      pendingRequest.current = null;
      setCreatedSalesProductId(response.salesProductId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
      form.openGenerationDialog({
        productName: title,
        templateId: selectedTemplateId,
        detailPageId: response.detailPageId,
        thumbnailGenerationId: response.thumbnailGenerationId,
        editorUrl: collectedProductDetailHref(response.salesProductId),
      });
    } catch (err) {
      form.setError(isApiError(err) ? err.detail : '상품 생성 요청에 실패했습니다.');
    } finally {
      setIsRegisteringCandidate(false);
    }
  };

  const handleGenerationDialogAction = async () => {
    const phase = generationDialog?.phase;
    const isCompleted = phase === 'completed';
    const targetUrl = createdSalesProductId
      ? collectedProductDetailHref(createdSalesProductId)
      : COLLECTED_PRODUCTS_ROOT;

    form.closeGenerationDialog();

    if (isCompleted) {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.productContent.detailGenerationsAll('kids-playful'),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.productContent.detailGenerationsAll('bold-vertical'),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all }),
      ]);
    }

    if (isCompleted || phase === 'started') {
      router.push(targetUrl);
    }
  };

  const handleGenerationDialogCancel = async () => {
    const state = generationDialog;
    if (!state || (!state.detailPageId && !state.thumbnailGenerationId)) return;
    try {
      await cancelProductGenerationChildren({
        detailPageId: state.detailPageId ?? null,
        thumbnailGenerationId: state.thumbnailGenerationId ?? null,
      });
      form.markGenerationDialogCancelled();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.productContent.detailGenerationsAll('kids-playful'),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.productContent.detailGenerationsAll('bold-vertical'),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailJobs.all }),
      ]);
    } catch (err) {
      form.setError(isApiError(err) ? err.detail : '상품 생성 중단 요청에 실패했습니다.');
    }
  };

  return {
    templateId,
    setTemplateId,
    isRegisteringCandidate,
    form: { ...form, generationDialog },
    handleSubmit,
    handleGenerationDialogAction,
    handleGenerationDialogCancel,
  };
}
