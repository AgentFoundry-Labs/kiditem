import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  GenerationProgressBannerStack,
  type GenerationEntry,
} from './GenerationProgressBanner';

const entry: GenerationEntry = {
  id: '11111111-1111-4111-8111-111111111111',
  templateId: 'kids-playful',
  status: 'processing',
  processedCount: 2,
  totalCount: 7,
  productName: '바삭바삭 수제 왁스팜4',
};

describe('GenerationProgressBannerStack', () => {
  it('shows a cancel button for an in-progress generation', () => {
    const onCancel = vi.fn();

    render(<GenerationProgressBannerStack entries={[entry]} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: '중단' }));

    expect(onCancel).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
  });

  it('disables cancel while the matching generation is cancelling', () => {
    render(
      <GenerationProgressBannerStack
        entries={[entry]}
        cancellingId="11111111-1111-4111-8111-111111111111"
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '중단' })).toBeDisabled();
  });

  it('disables cancel until the optimistic row is replaced with a server UUID', () => {
    render(
      <GenerationProgressBannerStack
        entries={[{ ...entry, id: 'optimistic-123' }]}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '중단' })).toBeDisabled();
  });
});
