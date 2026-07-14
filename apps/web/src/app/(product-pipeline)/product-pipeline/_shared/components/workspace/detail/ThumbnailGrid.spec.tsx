import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ThumbnailGrid from './ThumbnailGrid';

describe('ThumbnailGrid', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the editor from thumbnail generation and the generation page from AI thumbnail generation', () => {
    const onOpenThumbnailGeneration = vi.fn();
    const onOpenThumbnailEditor = vi.fn();

    render(
      <ThumbnailGrid
        thumbnails={['https://cdn.example.com/product.jpg']}
        onThumbnailsChange={vi.fn()}
        onOpenThumbnailGeneration={onOpenThumbnailGeneration}
        onOpenThumbnailEditor={onOpenThumbnailEditor}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '썸네일 편집' }));

    expect(onOpenThumbnailEditor).toHaveBeenCalledTimes(1);
    expect(onOpenThumbnailGeneration).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'AI 썸네일 생성' }));

    expect(onOpenThumbnailEditor).toHaveBeenCalledTimes(1);
    expect(onOpenThumbnailGeneration).toHaveBeenCalledTimes(1);
  });

  it('does not expose raw source wording in the thumbnail image section', () => {
    render(
      <ThumbnailGrid
        thumbnails={['https://cdn.example.com/product.jpg']}
        registrationOptions={[
          {
            url: 'https://cdn.example.com/product.jpg',
            kind: 'source',
            generatedGenerationId: null,
            generatedCandidateId: null,
          },
          {
            url: 'https://cdn.example.com/generated.jpg',
            kind: 'generated',
            generatedGenerationId: 'generation-1',
            generatedCandidateId: 'candidate-1',
          },
        ]}
        onThumbnailsChange={vi.fn()}
        onOpenThumbnailGeneration={vi.fn()}
        onOpenThumbnailEditor={vi.fn()}
      />,
    );

    expect(screen.getByText('이미지 1/10장 · AI 생성 1장')).toBeInTheDocument();
    expect(screen.queryByText(/원본/)).not.toBeInTheDocument();
  });

  it('caps source thumbnail display at ten images', () => {
    const thumbnails = Array.from({ length: 12 }, (_, index) =>
      `https://cdn.example.com/product-${index + 1}.jpg`,
    );

    render(
      <ThumbnailGrid
        thumbnails={thumbnails}
        onThumbnailsChange={vi.fn()}
        onOpenThumbnailGeneration={vi.fn()}
        onOpenThumbnailEditor={vi.fn()}
      />,
    );

    expect(screen.getByText('이미지 10/10장')).toBeInTheDocument();
    const images = screen.getAllByAltText(/상품 이미지/);
    expect(images).toHaveLength(10);
    expect(images[0]).toHaveAttribute('src', 'https://cdn.example.com/product-3.jpg');
    expect(screen.getByRole('button', { name: '이미지 추가' })).toBeEnabled();
  });

  it('asks before replacing the oldest non-selected image when adding past ten', () => {
    const onThumbnailsChange = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const thumbnails = Array.from({ length: 10 }, (_, index) =>
      `https://cdn.example.com/product-${index + 1}.jpg`,
    );

    render(
      <ThumbnailGrid
        thumbnails={thumbnails}
        selectedRegistrationThumbnailUrl="https://cdn.example.com/product-1.jpg"
        onThumbnailsChange={onThumbnailsChange}
        onOpenThumbnailGeneration={vi.fn()}
        onOpenThumbnailEditor={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '이미지 추가' }));

    expect(window.confirm).toHaveBeenCalledWith(
      '이미지는 최대 10장까지 사용할 수 있어요. 오래된 이미지 1장을 제외하고 진행할까요?',
    );
    expect(onThumbnailsChange).toHaveBeenCalledWith([
      'https://cdn.example.com/product-1.jpg',
      'https://cdn.example.com/product-3.jpg',
      'https://cdn.example.com/product-4.jpg',
      'https://cdn.example.com/product-5.jpg',
      'https://cdn.example.com/product-6.jpg',
      'https://cdn.example.com/product-7.jpg',
      'https://cdn.example.com/product-8.jpg',
      'https://cdn.example.com/product-9.jpg',
      'https://cdn.example.com/product-10.jpg',
      'https://placehold.co/400x400/e2e8f0/64748b?text=상품+11',
    ]);
  });

  it('does not replace images when the ten-image warning is cancelled', () => {
    const onThumbnailsChange = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const thumbnails = Array.from({ length: 10 }, (_, index) =>
      `https://cdn.example.com/product-${index + 1}.jpg`,
    );

    render(
      <ThumbnailGrid
        thumbnails={thumbnails}
        onThumbnailsChange={onThumbnailsChange}
        onOpenThumbnailGeneration={vi.fn()}
        onOpenThumbnailEditor={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '이미지 추가' }));

    expect(onThumbnailsChange).not.toHaveBeenCalled();
  });

  it('asks before cleaning up overflow images when starting AI thumbnail generation', () => {
    const onThumbnailsChange = vi.fn();
    const onOpenThumbnailGeneration = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const thumbnails = Array.from({ length: 12 }, (_, index) =>
      `https://cdn.example.com/product-${index + 1}.jpg`,
    );

    render(
      <ThumbnailGrid
        thumbnails={thumbnails}
        selectedRegistrationThumbnailUrl="https://cdn.example.com/product-12.jpg"
        onThumbnailsChange={onThumbnailsChange}
        onOpenThumbnailGeneration={onOpenThumbnailGeneration}
        onOpenThumbnailEditor={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'AI 썸네일 생성' }));

    expect(window.confirm).toHaveBeenCalled();
    expect(onThumbnailsChange).toHaveBeenCalledWith([
      'https://cdn.example.com/product-3.jpg',
      'https://cdn.example.com/product-4.jpg',
      'https://cdn.example.com/product-5.jpg',
      'https://cdn.example.com/product-6.jpg',
      'https://cdn.example.com/product-7.jpg',
      'https://cdn.example.com/product-8.jpg',
      'https://cdn.example.com/product-9.jpg',
      'https://cdn.example.com/product-10.jpg',
      'https://cdn.example.com/product-11.jpg',
      'https://cdn.example.com/product-12.jpg',
    ]);
    expect(onOpenThumbnailGeneration).toHaveBeenCalledTimes(1);
  });
});
