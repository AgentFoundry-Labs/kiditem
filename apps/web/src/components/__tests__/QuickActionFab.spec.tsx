import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import QuickActionFab from '../QuickActionFab';

describe('QuickActionFab', () => {
  it('hides action items until the trigger is pressed', () => {
    render(<QuickActionFab />);
    expect(screen.queryByRole('link', { name: '상품 생성' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '상세페이지 생성' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '썸네일 생성' })).not.toBeInTheDocument();
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
    expect(screen.queryByRole('link', { name: '상품 생성' })).not.toBeInTheDocument();
  });

  it('adds one AgentOS interaction action to the existing fan', () => {
    const openAgentInteraction = vi.fn();
    render(<QuickActionFab onAgentInteractionOpen={openAgentInteraction} />);

    fireEvent.click(screen.getByRole('button', { name: '퀵 메뉴 열기' }));
    fireEvent.click(screen.getByRole('button', { name: 'AgentOS 대화 열기' }));

    expect(openAgentInteraction).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('quick-action-fab')).toHaveLength(1);
  });
});
