import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductContentWorkspaceCard } from './ProductContentWorkspaceCard';
import type { ProductContentWorkspaceItem } from '../lib/product-content-api';

const item: ProductContentWorkspaceItem = {
  id: 'product:product-123',
  workspaceType: 'product',
  title: '큐브 퍼즐 workspace',
  subtitle: '상세페이지 2개 · 이미지 1개',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  productId: 'product-123',
  product: { id: 'product-123', code: 'M-00000001', name: '큐브 퍼즐' },
  generationGroupId: null,
  href: '/product-content/product-123',
  generationCount: 3,
  detailPageCount: 2,
  imageCount: 1,
  latestGenerationId: 'generation-123',
  latestStatus: 'completed',
  latestUpdatedAt: '2026-05-13T10:00:00.000Z',
};

describe('ProductContentWorkspaceCard', () => {
  it('keeps workspace navigation separate from the delete action', () => {
    const onDelete = vi.fn();

    render(<ProductContentWorkspaceCard item={item} onDelete={onDelete} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/product-content/product-123');
    fireEvent.click(screen.getByRole('button', { name: 'workspace 삭제' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
