import { describe, expect, it, vi } from 'vitest';
import type { DetailPageRepositoryPort, DetailPageRow } from '../../port/out/repository/detail-page.repository.port';
import { DetailPageQueryService } from '../detail-page-query.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const PAGE_ID = '33333333-3333-4333-8333-333333333333';
const WORKSPACE_ID = '77777777-7777-4777-8777-777777777777';

function page(overrides: Partial<DetailPageRow> = {}): DetailPageRow {
  return {
    id: PAGE_ID,
    organizationId: ORG,
    contentWorkspaceId: WORKSPACE_ID,
    source: 'generated',
    templateId: 'bold-vertical',
    title: '키즈 텀블러',
    status: 'ready',
    generationInput: { rawTitle: '키즈 텀블러', imageUrls: ['https://example.com/a.jpg'] },
    generationResult: { templateId: 'bold-vertical', result: { hook: { text: '텀블러' } }, processedImages: {} },
    errorMessage: null,
    currentRevisionId: null,
    triggeredByUserId: null,
    createdAt: new Date('2026-05-12T01:00:00.000Z'),
    updatedAt: new Date('2026-05-12T01:00:00.000Z'),
    ...overrides,
  };
}

function makeService(detailPages: Partial<DetailPageRepositoryPort>) {
  const repository = {
    runInTransaction: vi.fn(async (work) => work({} as never)),
    ...detailPages,
  } as unknown as DetailPageRepositoryPort;
  const service = new DetailPageQueryService(
    repository,
    { suppressProductInfoWhenSafetyLabelExists: vi.fn((result) => result) } as never,
    { extractKey: vi.fn().mockReturnValue(null), copy: vi.fn(), delete: vi.fn() } as never,
  );
  return { service, repository };
}

describe('DetailPageQueryService', () => {
  it('lists a workspace\'s detail pages and filters by template', async () => {
    const { service, repository } = makeService({
      listByWorkspace: vi.fn().mockResolvedValue([
        page(),
        page({ id: '44444444-4444-4444-8444-444444444444', templateId: 'kids-playful', generationResult: { templateId: 'kids-playful' } }),
      ]),
    });

    const rows = await service.list(ORG, { contentWorkspaceId: WORKSPACE_ID, templateId: 'bold-vertical' });

    expect(rows.map((row) => row.id)).toEqual([PAGE_ID]);
    expect(repository.listByWorkspace).toHaveBeenCalledWith({ organizationId: ORG, contentWorkspaceId: WORKSPACE_ID });
  });

  it('projects the page status onto the progress values the web polls', async () => {
    const pending = makeService({ findById: vi.fn().mockResolvedValue(page({ status: 'pending' })) });
    const failed = makeService({ findById: vi.fn().mockResolvedValue(page({ status: 'failed', errorMessage: '취소' })) });

    await expect(pending.service.getById(PAGE_ID, ORG)).resolves.toMatchObject({ imageProcessingStatus: 'processing' });
    await expect(failed.service.getById(PAGE_ID, ORG)).resolves.toMatchObject({
      imageProcessingStatus: 'failed',
      imageProcessingError: '취소',
      result: { hook: { text: '텀블러' } },
      productName: '키즈 텀블러',
    });
  });

  it('rejects JSON before saving and a blank title before renaming', async () => {
    const { service, repository } = makeService({ findById: vi.fn(), rename: vi.fn() });

    await expect(service.saveEditedHtml(PAGE_ID, ORG, '{"hook":{}}')).rejects.toThrow('렌더링 가능한 상세페이지 HTML만 저장할 수 있습니다.');
    await expect(service.renameVersion(PAGE_ID, ORG, '   ')).rejects.toThrow('title is required');
    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.rename).not.toHaveBeenCalled();
  });

  it('renames a page with a trimmed title', async () => {
    const { service, repository } = makeService({ rename: vi.fn().mockResolvedValue(true) });

    await expect(service.renameVersion(PAGE_ID, ORG, '  새 이름  ')).resolves.toEqual({ ok: true });
    expect(repository.rename).toHaveBeenCalledWith(expect.anything(), { organizationId: ORG, detailPageId: PAGE_ID, title: '새 이름' });
  });
});
