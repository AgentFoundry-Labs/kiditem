import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { DetailPageQueryService } from '../application/service/detail-page-query.service';
import type { ImageStoragePort } from '../application/port/out/storage/image-storage.port';

const RENDERABLE = (body: string) => `<!DOCTYPE html><html><head></head><body>${body}</body></html>`;

/**
 * 편집기 · 복제 · 올린 상세(KID-313 W3b). 한 상세 페이지 id 로 읽고 쓰며, 생성 페이지의 첫 저장은 웹이 그린 HTML 이라
 * `generated`, 그다음 저장은 사람의 `manual_edit` 이다. 이미지 저장소는 바깥 경계라 가짜로 둔다.
 */
describe('detail page editor (PG integration)', () => {
  let prisma: PrismaClient;
  let pages: DetailPageRepositoryAdapter;
  let editor: DetailPageQueryService;
  const storage = {
    extractKey: (url: string) => (url.startsWith('https://storage.example/') ? url.slice('https://storage.example/'.length) : null),
    copy: async (_from: string, to: string) => `https://storage.example/${to}`,
    delete: async () => undefined,
  } as unknown as ImageStoragePort;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    pages = new DetailPageRepositoryAdapter(prisma as unknown as PrismaService);
    editor = new DetailPageQueryService(
      pages,
      { suppressProductInfoWhenSafetyLabelExists: (result: unknown) => result } as never,
      storage,
    );
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function workspace(): Promise<string> {
    const row = await prisma.contentWorkspace.create({
      data: { organizationId: TEST_ORGANIZATION_ID, ownerType: 'sales_product', salesProductId: randomUUID(), status: 'active' },
      select: { id: true },
    });
    return row.id;
  }

  async function readyGeneratedPage(contentWorkspaceId: string): Promise<string> {
    return prisma.$transaction(async (tx) => {
      const page = await pages.create(ownerTransaction(tx), {
        organizationId: TEST_ORGANIZATION_ID, contentWorkspaceId, source: 'generated', templateId: 'bold-vertical',
        title: '말랑 장화', status: 'pending', generationInput: { rawTitle: '말랑 장화' }, triggeredByUserId: TEST_USER_ID,
      });
      await pages.setStatus(ownerTransaction(tx), { organizationId: TEST_ORGANIZATION_ID, detailPageId: page.id, status: 'processing' });
      await pages.completeGeneration(ownerTransaction(tx), {
        organizationId: TEST_ORGANIZATION_ID, detailPageId: page.id, title: '말랑 장화',
        generationResult: { templateId: 'bold-vertical', result: { hook: { text: '말랑' } }, imageUrls: [], processedImages: {} },
      });
      return page.id;
    });
  }

  async function revisionTypes(detailPageId: string): Promise<string[]> {
    const rows = await prisma.detailPageRevision.findMany({
      where: { detailPageId }, orderBy: { createdAt: 'asc' }, select: { revisionType: true },
    });
    return rows.map((row) => row.revisionType);
  }

  it('saves the first rendered HTML of a generated page as its generated revision, and later saves as human edits', async () => {
    const workspaceId = await workspace();
    const pageId = await readyGeneratedPage(workspaceId);
    await expect(editor.getEditedHtml(pageId, TEST_ORGANIZATION_ID)).resolves.toEqual({ html: null, savedAt: null });

    await editor.saveEditedHtml(pageId, TEST_ORGANIZATION_ID, RENDERABLE('<img src="https://cdn.example/a.jpg"><p>첫 렌더</p>'));
    await editor.saveEditedHtml(pageId, TEST_ORGANIZATION_ID, RENDERABLE('<p>고친 것</p>'));

    expect(await revisionTypes(pageId)).toEqual(['generated', 'manual_edit']);
    await expect(editor.getEditedHtml(pageId, TEST_ORGANIZATION_ID)).resolves.toMatchObject({ html: RENDERABLE('<p>고친 것</p>') });
    const first = await prisma.detailPageRevision.findFirstOrThrow({ where: { detailPageId: pageId, revisionType: 'generated' } });
    expect(first.imageUrls).toEqual(['https://cdn.example/a.jpg']);
    await expect(prisma.contentWorkspace.findUniqueOrThrow({ where: { id: workspaceId } }))
      .resolves.toMatchObject({ currentDetailPageRevisionId: expect.any(String) });
  });

  it('copies a temporary edited image to a permanent key named after the detail page', async () => {
    const workspaceId = await workspace();
    const pageId = await readyGeneratedPage(workspaceId);

    const saved = await editor.saveEditedHtml(
      pageId, TEST_ORGANIZATION_ID, RENDERABLE('<img src="https://storage.example/tmp/image-edits/x.png">'),
    );

    expect(Object.values(saved.assetUrlMap)).toEqual([expect.stringMatching(new RegExp(`^https://storage.example/content-assets/${TEST_ORGANIZATION_ID}/${pageId}/[0-9a-f]{32}\\.png$`))]);
    expect(saved.html).not.toContain('tmp/image-edits');
  });

  it('duplicates a page into a new human page whose copy becomes the current detail, and refuses a page with nothing saved', async () => {
    const workspaceId = await workspace();
    const pageId = await readyGeneratedPage(workspaceId);
    await expect(editor.duplicateVersion(pageId, TEST_ORGANIZATION_ID, TEST_USER_ID)).rejects.toBeInstanceOf(BadRequestException);

    await editor.saveEditedHtml(pageId, TEST_ORGANIZATION_ID, RENDERABLE('<p>원본</p>'));
    const copy = await editor.duplicateVersion(pageId, TEST_ORGANIZATION_ID, TEST_USER_ID);

    expect(copy).toMatchObject({ contentWorkspaceId: workspaceId, productName: '말랑 장화 복사본' });
    expect(await revisionTypes(copy.id)).toEqual(['duplicate']);
    const copyPage = await pages.findById({ organizationId: TEST_ORGANIZATION_ID, detailPageId: copy.id });
    expect(copyPage).toMatchObject({ source: 'manual', templateId: 'bold-vertical' });
    await expect(prisma.contentWorkspace.findUniqueOrThrow({ where: { id: workspaceId } }))
      .resolves.toMatchObject({ currentDetailPageRevisionId: copyPage?.currentRevisionId });
    await expect(editor.getEditedHtml(copy.id, TEST_ORGANIZATION_ID)).resolves.toMatchObject({ html: RENDERABLE('<p>원본</p>') });
  });

  it('registers an uploaded detail as one uploaded page with a human revision that becomes current', async () => {
    const workspaceId = await workspace();

    const uploaded = await editor.registerUploaded({
      organizationId: TEST_ORGANIZATION_ID,
      triggeredByUserId: TEST_USER_ID,
      contentWorkspaceId: workspaceId,
      title: '올린 상세',
      imageUrls: ['https://cdn.example/u1.jpg', 'https://cdn.example/u2.jpg'],
    });

    const page = await pages.findById({ organizationId: TEST_ORGANIZATION_ID, detailPageId: uploaded.id });
    expect(page).toMatchObject({ source: 'uploaded', status: 'ready', title: '올린 상세', contentWorkspaceId: workspaceId });
    expect(await revisionTypes(uploaded.id)).toEqual(['manual_edit']);
    await expect(prisma.contentWorkspace.findUniqueOrThrow({ where: { id: workspaceId } }))
      .resolves.toMatchObject({ currentDetailPageRevisionId: page?.currentRevisionId });
  });

  it('hides another organization\'s or a deleted page behind not found', async () => {
    const workspaceId = await workspace();
    const pageId = await readyGeneratedPage(workspaceId);
    await editor.remove(pageId, TEST_ORGANIZATION_ID);

    await expect(editor.getById(pageId, TEST_ORGANIZATION_ID)).rejects.toThrow('Detail page not found');
    await expect(editor.saveEditedHtml(pageId, TEST_ORGANIZATION_ID, RENDERABLE('<p>x</p>'))).rejects.toThrow('Detail page not found');
    await expect(editor.getEditedHtml(randomUUID(), TEST_ORGANIZATION_ID)).rejects.toThrow('Detail page not found');
  });
});
