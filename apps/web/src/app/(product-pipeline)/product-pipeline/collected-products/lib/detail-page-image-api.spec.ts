import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { contentWorkspacesApi } from '../../_shared/lib/content-workspaces-api';
import { renderRegistrationDetailImage } from './detail-page-image-api';

vi.mock('@/lib/api-client', () => ({ apiClient: { post: vi.fn() } }));
vi.mock('../../_shared/lib/content-workspaces-api', () => ({
  contentWorkspacesApi: { getForSalesProduct: vi.fn() },
}));

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const REVISION_ID = '22222222-2222-4222-8222-222222222222';
const READY = {
  status: 'ready',
  artifactId: '33333333-3333-4333-8333-333333333333',
  revisionId: REVISION_ID,
  imageUrl: 'https://cdn.example.com/detail.jpg',
  outputWidth: 780,
  contentType: 'image/jpeg',
  byteLength: 1024,
};

/**
 * 상세 이미지 서버 렌더(KID-321 F). 라우트는 작업공간 것 하나뿐이고(`workspace/:id/server-render`, KID-310),
 * 등록 실행이 있으면 그 실행이 얼린 상세 revision(등록 대상이 고른 것)을 렌더하게 한다.
 */
describe('renderRegistrationDetailImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(contentWorkspacesApi.getForSalesProduct).mockResolvedValue({ id: WORKSPACE_ID } as never);
    vi.mocked(apiClient.post).mockResolvedValue(READY);
  });

  it('renders the revision the registration execution froze, on the workspace route', async () => {
    await expect(renderRegistrationDetailImage({
      salesProductId: 'sales-product-1',
      detailPageRevisionId: REVISION_ID,
    })).resolves.toMatchObject({ status: 'ready', imageUrl: READY.imageUrl });

    expect(contentWorkspacesApi.getForSalesProduct).toHaveBeenCalledWith('sales-product-1');
    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/ai/detail-page-image/workspace/${WORKSPACE_ID}/server-render`,
      { detailPageRevisionId: REVISION_ID },
    );
  });

  it('renders the current revision when no execution chose one', async () => {
    await renderRegistrationDetailImage({ salesProductId: 'sales-product-1' });

    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/ai/detail-page-image/workspace/${WORKSPACE_ID}/server-render`,
      {},
    );
  });

  it('never calls the retired candidate route', async () => {
    await renderRegistrationDetailImage({ salesProductId: 'sales-product-1', detailPageRevisionId: REVISION_ID });

    expect(vi.mocked(apiClient.post).mock.calls.every(([path]) => !String(path).includes('/candidate/'))).toBe(true);
  });

  it('says so instead of rendering something else when the product has no content workspace', async () => {
    vi.mocked(contentWorkspacesApi.getForSalesProduct).mockResolvedValue(null);

    await expect(renderRegistrationDetailImage({ salesProductId: 'sales-product-1' })).rejects.toThrow(
      '이 상품에는 콘텐츠 작업공간이 없어 상세 이미지를 만들 수 없습니다.',
    );
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
