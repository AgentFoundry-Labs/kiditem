import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductContentCard } from './ProductContentCard';
import type { ProductContentCardItem } from '../lib/product-content-api';

const item: ProductContentCardItem = {
  generationId: 'generation-456',
  productId: 'product-123',
  productCode: 'M-00000001',
  productName: '큐브 퍼즐',
  title: 'KIDITEM DESIGN 상세',
  subtitle: '초등 고학년 집중 놀이',
  templateId: 'bold-vertical',
  status: 'completed',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  errorMessage: null,
  isTemporaryProduct: true,
  editedHtmlSavedAt: null,
  createdAt: '2026-05-12T10:00:00.000Z',
  updatedAt: '2026-05-12T10:00:00.000Z',
};

describe('ProductContentCard', () => {
  it('links generated content cards to the product-content editor', () => {
    render(<ProductContentCard item={item} />);

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/product-content/product-123/editor?generationId=generation-456',
    );
    expect(screen.getByText('KIDITEM DESIGN 상세')).toBeInTheDocument();
  });
});
