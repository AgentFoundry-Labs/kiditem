'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/api-error';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  collectedProductDetailHref,
  COLLECTED_PRODUCTS_ROOT,
} from '../../_shared/lib/product-pipeline-routes';
import { useGenerateForm, type GenerateTemplateId } from '../../detail-template-generation/hooks/useGenerateForm';

interface ManualProductRegistrationResponse {
  ok: boolean;
  candidateId: string;
  href: string;
}

function optionNamesFromRawOptions(rawOptions: string): string[] {
  return [...new Set(
    rawOptions
      .split(/[\n,]/)
      .map((option) => option.trim())
      .filter(Boolean),
  )].slice(0, 10);
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

  const handleSubmit = async (selectedTemplateId: GenerateTemplateId, thumbnailUrl: string | null) => {
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
      const candidate = await apiClient.post<ManualProductRegistrationResponse>(
        '/api/sourcing/product-registration',
        {
          title,
          category: form.rawCategory.trim() || undefined,
          description: form.rawDescription.trim() || undefined,
          target: form.target.trim() || undefined,
          thumbnailUrl: thumbnailUrl ?? undefined,
          imageUrls: form.images,
          optionNames: optionNamesFromRawOptions(form.rawOptions),
        },
      );
      setCreatedCandidateId(candidate.candidateId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
      await form.handleSubmit(selectedTemplateId, {
        sourceReferences: [
          {
            sourceType: 'sourcing_candidate',
            sourceCandidateId: candidate.candidateId,
            label: title,
          },
        ],
      });
    } catch (err) {
      form.setError(isApiError(err) ? err.detail : '상품 등록 후보 생성에 실패했습니다.');
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

  return {
    templateId,
    setTemplateId,
    isRegisteringCandidate,
    form,
    handleSubmit,
    handleGenerationDialogAction,
  };
}
