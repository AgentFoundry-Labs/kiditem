import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ThumbnailGrid from './ThumbnailGrid';

describe('ThumbnailGrid', () => {
  it('exposes the standalone thumbnail generation tool separately from inline AI generation', () => {
    const onOpenThumbnailEditor = vi.fn();
    const onGenerateThumbnail = vi.fn();

    render(
      <ThumbnailGrid
        thumbnails={['https://cdn.example.com/product.jpg']}
        onThumbnailsChange={vi.fn()}
        onGenerateThumbnail={onGenerateThumbnail}
        onOpenThumbnailEditor={onOpenThumbnailEditor}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '썸네일 생성' }));

    expect(onOpenThumbnailEditor).toHaveBeenCalledTimes(1);
    expect(onGenerateThumbnail).not.toHaveBeenCalled();
  });
});
