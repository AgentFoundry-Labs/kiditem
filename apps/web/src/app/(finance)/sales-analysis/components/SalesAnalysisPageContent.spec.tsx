import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SalesAnalysisPageContent from './SalesAnalysisPageContent';

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/sales-analysis',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('tab=overview'),
}));

describe('SalesAnalysisPageContent', () => {
  it('renders one prominent page heading above the analysis tabs', () => {
    render(<SalesAnalysisPageContent initialTab="overview" />);

    expect(screen.getAllByRole('heading', { name: '매출 분석' })).toHaveLength(1);
    expect(screen.getByRole('tab', { name: '매출 분석' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
