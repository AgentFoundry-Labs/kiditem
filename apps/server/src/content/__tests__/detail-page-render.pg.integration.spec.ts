import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import { ownerTransaction } from '../../prisma/owner-transaction';
import { DetailPageRepositoryAdapter } from '../adapter/out/repository/detail-page.repository.adapter';
import { DetailPageImageRepositoryAdapter } from '../adapter/out/repository/detail-page-image.repository.adapter';
import { DetailPageClientRenderService } from '../application/service/detail-page-client-render.service';

const sharp: typeof import('sharp') = require('sharp');

/**
 * 몰 상세 이미지 렌더는 revision 으로 한다(KID-321) — 렌더 의도는 그 revision 의 상세 페이지 id 를 갖는다(KID-313 W3b).
 * 사진 저장 · 헤드리스 브라우저는 바깥 경계라 가짜로 두고, 의도 · 결과 행은 실제 PostgreSQL 에 쓴다.
 */
describe('detail page mall render (PG integration)', () => {
  let prisma: PrismaClient;
  let pages: DetailPageRepositoryAdapter;
  let render: DetailPageClientRenderService;
  let jpeg: Buffer;
  const rasterization = { render: vi.fn() };

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    jpeg = await sharp({ create: { width: 780, height: 1200, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
    const service = prisma as unknown as PrismaService;
    pages = new DetailPageRepositoryAdapter(service);
    render = new DetailPageClientRenderService(
      pages,
      new DetailPageImageRepositoryAdapter(service),
      { save: async (key: string) => `https://storage.example/${key}` } as never,
      { getCompiledCss: () => '' },
      rasterization as never,
    );
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    vi.stubEnv('WEB_ORIGIN', 'https://office.example');
    rasterization.render.mockReset().mockResolvedValue({ contentType: 'image/jpeg', buffer: jpeg });
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterEach(() => vi.unstubAllEnvs());

  async function workspaceWithTwoPages() {
    const workspace = await prisma.contentWorkspace.create({
      data: { organizationId: TEST_ORGANIZATION_ID, ownerType: 'sales_product', salesProductId: randomUUID(), status: 'active' },
    });
    const page = async (html: string) => prisma.$transaction(async (tx) => {
      const created = await pages.create(ownerTransaction(tx), {
        organizationId: TEST_ORGANIZATION_ID, contentWorkspaceId: workspace.id, source: 'manual', templateId: null,
        title: null, status: 'ready', generationInput: {}, triggeredByUserId: TEST_USER_ID,
      });
      const revision = await pages.appendRevision(ownerTransaction(tx), {
        organizationId: TEST_ORGANIZATION_ID, detailPageId: created.id, revisionType: 'manual_edit', html, imageUrls: [],
        createdByUserId: TEST_USER_ID,
      });
      return { detailPageId: created.id, revisionId: revision.id };
    });
    const older = await page('<p>고른 상세</p>');
    const current = await page('<p>현재 상세</p>');
    return { workspaceId: workspace.id, older, current };
  }

  it('renders the workspace current revision once and binds the intent to its detail page', async () => {
    const { workspaceId, current } = await workspaceWithTwoPages();

    const first = await render.prepare({ organizationId: TEST_ORGANIZATION_ID, userId: TEST_USER_ID, contentWorkspaceId: workspaceId });
    const again = await render.prepare({ organizationId: TEST_ORGANIZATION_ID, userId: TEST_USER_ID, contentWorkspaceId: workspaceId });

    expect(first).toMatchObject({ status: 'ready', revisionId: current.revisionId });
    expect(again).toEqual(first);
    expect(rasterization.render).toHaveBeenCalledTimes(1);
    expect(rasterization.render.mock.calls[0]![0].html).toContain('<p>현재 상세</p>');
    await expect(prisma.detailPageImageRenderIntent.findMany({ select: { detailPageId: true, revisionId: true, state: true } }))
      .resolves.toEqual([{ detailPageId: current.detailPageId, revisionId: current.revisionId, state: 'completed' }]);
  });

  it('renders the revision a target chose, on its own page, and refuses one from another workspace', async () => {
    const { workspaceId, older } = await workspaceWithTwoPages();
    const other = await workspaceWithTwoPages();

    await expect(render.prepare({
      organizationId: TEST_ORGANIZATION_ID, userId: TEST_USER_ID, contentWorkspaceId: workspaceId, detailPageRevisionId: older.revisionId,
    })).resolves.toMatchObject({ status: 'ready', revisionId: older.revisionId });
    await expect(prisma.detailPageImageRenderIntent.findFirstOrThrow({ select: { detailPageId: true } }))
      .resolves.toEqual({ detailPageId: older.detailPageId });

    await expect(render.prepare({
      organizationId: TEST_ORGANIZATION_ID, userId: TEST_USER_ID, contentWorkspaceId: workspaceId, detailPageRevisionId: other.current.revisionId,
    })).rejects.toMatchObject({ code: 'CONTENT_SELECTION_INVALID', details: { reason: 'DETAIL_REVISION_NOT_OWNED' } });
  });

  it('answers missing for a workspace without a saved detail and serves a claimed intent the bound revision document', async () => {
    const empty = await prisma.contentWorkspace.create({
      data: { organizationId: TEST_ORGANIZATION_ID, ownerType: 'sales_product', salesProductId: randomUUID(), status: 'active' },
    });
    await expect(render.prepare({ organizationId: TEST_ORGANIZATION_ID, userId: TEST_USER_ID, contentWorkspaceId: empty.id }))
      .resolves.toMatchObject({ status: 'missing', reason: 'no_saved_detail_page' });

    const { older } = await workspaceWithTwoPages();
    const intent = await prisma.detailPageImageRenderIntent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID, detailPageId: older.detailPageId, revisionId: older.revisionId,
        variant: 'wing-client-jpeg-v1', outputWidth: 780, objectKey: `detail-page-images/${randomUUID()}.jpg`,
        state: 'claimed', claimedByUserId: TEST_USER_ID, claimedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const document = await render.document({ organizationId: TEST_ORGANIZATION_ID, userId: TEST_USER_ID, intentId: intent.id });
    expect(document).toMatchObject({ intentId: intent.id, revisionId: older.revisionId });
    expect(document.html).toContain('<p>고른 상세</p>');
  });
});
