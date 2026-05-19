import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import QuickActionFab from '../QuickActionFab';

describe('QuickActionFab', () => {
  it('hides action items until the trigger is pressed', () => {
    render(<QuickActionFab />);
    const productLink = screen.getByRole('link', { name: '상품 생성' });
    expect(productLink).toHaveAttribute('href', '/product-pipeline/productgenerate');
    expect(productLink).toHaveAttribute('tabindex', '-1');
    expect(productLink.className).toContain('opacity-0');
  });

  it('reveals product, detail and thumbnail shortcuts when expanded', () => {
    render(<QuickActionFab />);

    fireEvent.click(screen.getByRole('button', { name: '퀵 메뉴 열기' }));

    expect(screen.getByRole('link', { name: '상품 생성' })).toHaveAttribute(
      'href',
      '/product-pipeline/productgenerate',
    );
    expect(screen.getByRole('link', { name: '상세페이지 생성' })).toHaveAttribute(
      'href',
      '/product-pipeline/detail-template-generation',
    );
    expect(screen.getByRole('link', { name: '썸네일 생성' })).toHaveAttribute(
      'href',
      '/product-pipeline/thumbnail-generation',
    );
    expect(screen.getByRole('button', { expanded: true })).toHaveAttribute(
      'aria-label',
      '퀵 메뉴 닫기',
    );
  });

  it('collapses when an action is selected', () => {
    render(<QuickActionFab />);
    fireEvent.click(screen.getByRole('button', { name: '퀵 메뉴 열기' }));
    fireEvent.click(screen.getByRole('link', { name: '상품 생성' }));
    expect(screen.getByRole('button', { name: '퀵 메뉴 열기' })).toBeInTheDocument();
  });
});
