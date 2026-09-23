import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
        source: { ready: false, latestAttempt: null, latestComplete: null, actualCutoffAt: null, errorCode: null, errorMessage: null },
        status: 'collected',
        candidateId: 'candidate-1',
        salesProductId: 'sales-product-1',
        href: '/product-pipeline/collected-products/sales-product-1',
      },
    });

    const button = screen.getByRole('button', { name: '이미 수집됨' });

    expect(button).toBeDisabled();
    expect(screen.getByRole('link', { name: '기존 상품 열기' })).toHaveAttribute(
      'href',
      '/product-pipeline/collected-products/sales-product-1',
    );
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('links a duplicate refusal to the draft that already holds the source', () => {
    renderInput({ error: '이미 수집한 원본입니다.', errorHref: '/product-pipeline/collected-products/draft-1' });

    expect(screen.getByText('이미 수집한 원본입니다.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '기존 초안 열기' })).toHaveAttribute(
      'href',
      '/product-pipeline/collected-products/draft-1',
    );
  });

  it('shows no link when the collected product has no draft to open', () => {
    renderInput({
      duplicate: {
        source: { ready: false, latestAttempt: null, latestComplete: null, actualCutoffAt: null, errorCode: null, errorMessage: null },
        status: 'collected',
        candidateId: 'candidate-1',
        salesProductId: null,
        href: null,
      },
    });

    expect(screen.getByText('이미 수집된 URL입니다.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '기존 상품 열기' })).toBeNull();
  });

  it('shows failed refresh and the actual previous complete cutoff', () => {
    renderInput({ error: 'provider unavailable', ownerStatus: { ready: false,
      latestAttempt: { attemptId: 'failed', state: 'FAILED', errorCode: 'FAILED', errorMessage: 'provider unavailable', expiresAt: '', completedAt: null },
      latestComplete: { attemptId: 'complete', state: 'COMPLETE', errorCode: null, errorMessage: null, expiresAt: '', completedAt: '2026-09-06T00:00:00Z' },
      actualCutoffAt: '2026-09-06T00:00:00Z', errorCode: 'FAILED', errorMessage: 'provider unavailable' } });
    expect(screen.getByRole('status')).toHaveTextContent('이전 완료 데이터 유지');
    expect(screen.getByRole('status').querySelector('time')).toHaveAttribute('dateTime', '2026-09-06T00:00:00Z');
    expect(screen.getByText('provider unavailable')).toBeInTheDocument();
  });
});
