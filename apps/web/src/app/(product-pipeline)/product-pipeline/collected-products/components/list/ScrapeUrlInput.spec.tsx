import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ScrapeUrlInput from './ScrapeUrlInput';

function renderInput(overrides: Partial<ComponentProps<typeof ScrapeUrlInput>> = {}) {
  const props: ComponentProps<typeof ScrapeUrlInput> = {
    scrapeUrl: 'https://detail.1688.com/offer/1.html',
    onChange: vi.fn(),
    onKeyDown: vi.fn(),
    onSubmit: vi.fn(),
    onClose: vi.fn(),
    isPending: false,
    error: null,
    success: null,
    inputRef: { current: null },
    duplicate: null,
    ...overrides,
  };
  return { ...render(<ScrapeUrlInput {...props} />), props };
}

describe('ScrapeUrlInput', () => {
  it('disables collection and shows the collected candidate link for duplicate URLs', () => {
    const onSubmit = vi.fn();
    renderInput({
      onSubmit,
      duplicate: {
        status: 'collected',
        candidateId: 'candidate-1',
        href: '/product-pipeline/collected-products/candidate-1',
      },
    });

    const button = screen.getByRole('button', { name: '이미 수집됨' });

    expect(button).toBeDisabled();
    expect(screen.getByRole('link', { name: '기존 상품 열기' })).toHaveAttribute(
      'href',
      '/product-pipeline/collected-products/candidate-1',
    );
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
