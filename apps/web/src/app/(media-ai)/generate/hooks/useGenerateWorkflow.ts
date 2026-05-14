'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useGenerateForm, type GenerateTemplateId } from './useGenerateForm';

export type GenerateWorkflowStep = 'template' | 'form';

export function useGenerateWorkflow() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<GenerateWorkflowStep>('template');
  const [templateId, setTemplateId] = useState<GenerateTemplateId>('bold-vertical');
  const form = useGenerateForm();

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
      : '/sourcing';

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

  return {
    step,
    templateId,
    form,
    pickTemplate,
    returnToTemplatePick,
    handleGenerationDialogAction,
  };
}
