import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GenerationProgressBannerStack } from './GenerationProgressBanner';

describe('GenerationProgressBannerStack', () => {
  it('shows indeterminate status instead of an untrackable image count', () => {
    render(
      <GenerationProgressBannerStack
        entries={[
          {
            id: 'generation-1',
            templateId: 'kids-playful',
            status: 'processing',
            productName: '테스트 상품',
          },
        ]}
      />,
    );

    expect(
      screen.getByRole('progressbar', { name: '상세페이지 생성 진행 상태' }),
    ).toHaveAttribute('aria-valuetext', 'AI 상세페이지 생성 중');
    expect(screen.queryByText(/이미지 \d+ \/ \d+개 처리됨/)).not.toBeInTheDocument();
    expect(screen.getByText(/생성 상태를 확인하고 있습니다/)).toBeInTheDocument();
  });

  it('offers a cancel action for running detail-page generation banners', async () => {
    const onCancel = vi.fn().mockResolvedValue(undefined);

    render(
      <GenerationProgressBannerStack
        entries={[
          {
            id: 'generation-1',
            templateId: 'kids-playful',
            status: 'processing',
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
