'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { REGISTERED_PRODUCTS_ROOT } from '../../_shared/lib/product-pipeline-routes';
import { useGenerateForm, type GenerateTemplateId } from './useGenerateForm';
import { useKidsPlayfulGenerationCancel } from './useKidsPlayfulGenerate';

export type GenerateWorkflowStep = 'template' | 'form';

export function useGenerateWorkflow() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<GenerateWorkflowStep>('template');
  const [templateId, setTemplateId] = useState<GenerateTemplateId>('bold-vertical');
  const form = useGenerateForm({ ownerBindingMode: 'sandbox-only' });
  const cancelGeneration = useKidsPlayfulGenerationCancel();

  const pickTemplate = (nextTemplateId: string) => {
    setTemplateId(nextTemplateId === 'kids-playful' ? 'kids-playful' : 'bold-vertical');
    setStep('form');
  };

  const returnToTemplatePick = () => setStep('template');

  const handleGenerationDialogAction = async () => {
    const phase = form.generationDialog?.phase;
    const isCompleted = phase === 'completed';
    const targetUrl = isCompleted && form.generationDialog?.editorUrl
      ? form.generationDialog.editorUrl
      : REGISTERED_PRODUCTS_ROOT;

    form.closeGenerationDialog();

    if (isCompleted) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['kp-generations'] }),
        queryClient.invalidateQueries({ queryKey: ['bold-generations'] }),
      ]);
    }

    if (isCompleted || phase === 'started') {
      router.push(targetUrl);
    }
  };

  const handleGenerationDialogCancel = async () => {
    const generationId = form.generationDialog?.generationId;
    if (!generationId) return;
    await cancelGeneration.mutateAsync(generationId);
    form.markGenerationDialogCancelled();
  };

  return {
    step,
    templateId,
    form,
    pickTemplate,
    returnToTemplatePick,
    handleGenerationDialogAction,
    handleGenerationDialogCancel,
  };
}
