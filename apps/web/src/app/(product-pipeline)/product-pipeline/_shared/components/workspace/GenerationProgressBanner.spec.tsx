import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GenerationProgressBannerStack } from './GenerationProgressBanner';

describe('GenerationProgressBannerStack', () => {
  it('offers a cancel action for running detail-page generation banners', async () => {
    const onCancel = vi.fn().mockResolvedValue(undefined);

    render(
      <GenerationProgressBannerStack
        entries={[
          {
            id: 'generation-1',
            templateId: 'kids-playful',
            status: 'processing',
            processedCount: 0,
            totalCount: 2,
            productName: '테스트 상품',
          },
        ]}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '상세페이지 생성 중단' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('상세페이지 생성을 중단할까요?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '계속 실행' }));

    expect(screen.queryByText('상세페이지 생성을 중단할까요?')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '상세페이지 생성 중단' }));

    fireEvent.click(screen.getByRole('button', { name: '중단' }));

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'generation-1' }),
      );
    });
  });
});
