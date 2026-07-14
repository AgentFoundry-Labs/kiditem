import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageSourceDrawer } from './ImageSourceDrawer';

vi.mock('../../hooks/useRecentGenerations', () => ({
  useRecentGenerations: () => ({ data: [], isLoading: false }),
}));

vi.mock('../../../_shared/hooks/useContentWorkspaceImages', () => ({
  useContentWorkspaceImages: () => ({ images: [], loading: false }),
}));

describe('ImageSourceDrawer content workspace capability', () => {
  it('allows selecting a Content Hub image without a product identity', async () => {
    const onPick = vi.fn();

    render(
      <ImageSourceDrawer
        role="product"
        contentWorkspaceId="workspace-1"
        hubImages={[
          {
            url: 'https://cdn.example.com/workspace-product.jpg',
            role: 'product',
            label: '워크스페이스 상품 이미지',
            sortOrder: 0,
          },
        ]}
        hubImagesLoading={false}
        availableTabs={['hub']}
        onPick={onPick}
      >
        <button type="button">이미지 소스 열기</button>
      </ImageSourceDrawer>,
    );

    fireEvent.click(screen.getByRole('button', { name: '이미지 소스 열기' }));
    fireEvent.click(await screen.findByRole('button', { name: '워크스페이스 상품 이미지' }));

    await waitFor(() =>
      expect(onPick).toHaveBeenCalledWith({
        value: 'https://cdn.example.com/workspace-product.jpg',
        source: 'hub',
      }),
    );
  });
});
