import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { contentWorkspacesApi } from '../../_shared/lib/content-workspaces-api';
import { buildGenerationHistoryHtml } from '../../_shared/lib/generated-detail-html';
import type { ProductDetailResponse } from './sourcing-api';
import {
  prepareSavedDetailImage,
  renderRegistrationDetailImage,
  requireRenderedDetailImage,
} from './detail-page-image-api';

vi.mock('@/lib/api-client', () => ({ apiClient: { post: vi.fn() } }));
vi.mock('../../_shared/lib/content-workspaces-api', () => ({
  contentWorkspacesApi: { getForSalesProduct: vi.fn() },
}));
vi.mock('../../_shared/lib/generated-detail-html', () => ({ buildGenerationHistoryHtml: vi.fn() }));

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

/** 몰 폼 · 파일이 쓰는 상세 이미지(수집상품 경로). 저장한 상세가 없으면 다른 이미지로 대신하지 않는다. */
describe('requireRenderedDetailImage', () => {
  it('gives the rendered image and refuses anything else', () => {
    expect(requireRenderedDetailImage(READY as never)).toBe(READY.imageUrl);
    expect(() => requireRenderedDetailImage({ status: 'missing', reason: 'no_saved_detail_page', message: '저장된 상세페이지가 없습니다.' }))
      .toThrow(/저장한 상세페이지가 있는 상품만/);
  });
});

describe('prepareSavedDetailImage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves the latest generated detail page once and renders again when nothing was saved yet', async () => {
    const generationId = '66666666-6666-4666-8666-666666666666';
    vi.mocked(contentWorkspacesApi.getForSalesProduct).mockResolvedValue({
      id: WORKSPACE_ID,
      // 생성은 끝났지만(ready) 아직 저장한 HTML 이 없다 — 몰로 가는 현재도 없다. 첫 저장이 generated revision 이 된다.
      currentDetailPageRevisionId: null,
      currentDetailPageId: null,
      latestDetailPageId: generationId,
      history: [{
        id: generationId, source: 'generated', status: 'ready', title: 't', templateId: 'kids-playful',
        generationInput: {}, detailPageData: { hook: { headline: 't' } }, imageUrls: [], processedImages: {},
        currentRevisionId: null, errorMessage: null, href: '', createdAt: '2026-07-25T00:00:00.000Z', updatedAt: '2026-07-25T00:00:00.000Z',
      }],
    } as never);
    vi.mocked(buildGenerationHistoryHtml).mockReturnValue('<html>saved</html>');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '' }));
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ status: 'missing', reason: 'no_saved_detail_page', message: '없음' })
      .mockResolvedValueOnce({ html: '<html>saved</html>' })
      .mockResolvedValueOnce(READY);

    await expect(prepareSavedDetailImage({ salesProductId: 'sales-product-1' } as ProductDetailResponse))
      .resolves.toMatchObject({ status: 'ready' });
    expect(apiClient.post).toHaveBeenNthCalledWith(2, `/api/ai/detail-page/${generationId}/edited-html`, { html: '<html>saved</html>' });
    expect(apiClient.post).toHaveBeenCalledTimes(3);
  });
});
