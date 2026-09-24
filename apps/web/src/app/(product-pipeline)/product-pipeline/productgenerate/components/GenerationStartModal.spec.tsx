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
  detailPageId: 'detail-generation-1',
  progress: 0.6,
  progressLabel: '상세페이지 완료 · 썸네일 생성 중',
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

  it('renders parent-operation milestone progress without image counts', async () => {
    render(
      <GenerationStartModal
        state={startedState}
        onClose={vi.fn()}
      />,
    );

    const progressbar = await screen.findByRole('progressbar', {
      name: '상품 생성 진행 상태',
    });
    expect(progressbar).toHaveAttribute('aria-valuenow', '60');
    expect(progressbar.firstElementChild).toHaveStyle({ width: '60%' });
    expect(screen.getByText('상세페이지 완료 · 썸네일 생성 중')).toBeInTheDocument();
    expect(screen.queryByText(/이미지 \d+ \/ \d+개 처리됨/)).not.toBeInTheDocument();
  });

  it('keeps cancelled progress at the last confirmed milestone', async () => {
    render(
      <GenerationStartModal
        state={{ ...startedState, phase: 'cancelled' }}
        onClose={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole('progressbar', { name: '상품 생성 진행 상태' }),
    ).toHaveAttribute('aria-valuenow', '60');
  });
});
