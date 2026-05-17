import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GenerationStartModal from './GenerationStartModal';
import type { GenerationDialogState } from '../../detail-template-generation/hooks/useGenerateForm';

const startedState: GenerationDialogState = {
  open: true,
  phase: 'started',
  startedAt: '2026-05-17T00:00:00.000Z',
  productName: '테스트 상품',
  templateId: 'bold-vertical',
  operationKey: 'product-generation:operation-1',
};

describe('Product GenerationStartModal', () => {
  it('offers a cancel action while product generation is running', async () => {
    const onCancel = vi.fn();

    render(
      <GenerationStartModal
        state={startedState}
        onClose={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '생성 중단' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '생성 중단' }));

    expect(onCancel).toHaveBeenCalledWith(startedState);
  });
});
