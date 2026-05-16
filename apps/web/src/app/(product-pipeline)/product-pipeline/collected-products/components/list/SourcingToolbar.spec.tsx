import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import SourcingToolbar from './SourcingToolbar';

function renderToolbar(overrides: Partial<ComponentProps<typeof SourcingToolbar>> = {}) {
  const props: ComponentProps<typeof SourcingToolbar> = {
    showScrapeInput: false,
    onToggleScrapeInput: vi.fn(),
    sort: 'newest',
    pageSize: 20,
    onSortChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    sourceFilter: 'all',
    onSourceFilterChange: vi.fn(),
    ...overrides,
  };
  return { ...render(<SourcingToolbar {...props} />), props };
}

describe('SourcingToolbar source tabs', () => {
  it('renders the product registration tab and emits filter changes', () => {
    const onSourceFilterChange = vi.fn();
    renderToolbar({ onSourceFilterChange });

    fireEvent.click(screen.getByRole('button', { name: '상품 생성' }));

    expect(onSourceFilterChange).toHaveBeenCalledWith('manual-registration');
  });

  it('marks the current source tab as selected', () => {
    renderToolbar({ sourceFilter: 'manual-registration' });

    expect(screen.getByRole('button', { name: '상품 생성' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '전체 후보' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
