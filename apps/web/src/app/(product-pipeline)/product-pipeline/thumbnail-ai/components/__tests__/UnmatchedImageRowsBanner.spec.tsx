import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UnmatchedImageRowsBanner } from '../UnmatchedImageRowsBanner';

describe('UnmatchedImageRowsBanner', () => {
  it('explains that unmatched image rows are separate from channel SKU stock matching', () => {
    render(<UnmatchedImageRowsBanner unmatchedCount={1234} onDismiss={vi.fn()} />);

    expect(screen.getByText('이미지 동기화에서 내부 상품을 찾지 못한 쿠팡 행 1,234건이 있습니다.')).toBeInTheDocument();
    expect(screen.getByText('이 결과는 채널 SKU 재고 매칭과 별개입니다. 이미지 원본 식별자를 확인해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/legacyCode|매칭 센터/)).not.toBeInTheDocument();
  });

  it('keeps only count and dismiss behavior', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<UnmatchedImageRowsBanner unmatchedCount={2} onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button', { name: '배너 닫기' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
