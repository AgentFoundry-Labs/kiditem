import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { RegistrationContentWorkspaceRepositoryAdapter } from '../adapter/out/repository/registration-content-workspace.repository.adapter';
import { RegistrationContentWorkspaceService } from '../application/service/registration-content-workspace.service';
import { DetailPageRepositoryAdapter } from '../adapter/out/repository/detail-page.repository.adapter';
import { ownerTransaction } from '../../prisma/owner-transaction';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ImportDetailPageInput } from '../application/port/in/workspace/registration-content-workspace.port';

describe('registration content workspace (PG integration)', () => {
  let prisma: PrismaClient;
  let content: RegistrationContentWorkspaceService;
  let detailPages: DetailPageRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    detailPages = new DetailPageRepositoryAdapter(prisma as unknown as PrismaService);
    content = new RegistrationContentWorkspaceService(new RegistrationContentWorkspaceRepositoryAdapter(
      prisma as unknown as PrismaService,
      detailPages,
    ));
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function ensureWorkspace(salesProductId = randomUUID()) {
    const { workspaceId } = await prisma.$transaction((tx) => content.ensureSalesProductWorkspace(ownerTransaction(tx), {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId,
      createdByUserId: TEST_USER_ID,
    }));
    return { salesProductId, workspaceId };
  }

  function importInput(salesProductId: string, overrides: Partial<ImportDetailPageInput> = {}): ImportDetailPageInput {
    return {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId,
      source: 'sabangnet',
      html: '<p>사방넷 상세</p>',
      digest: 'digest-1',
      createdByUserId: null,
      ...overrides,
    };
  }

  function importDetail(input: ImportDetailPageInput) {
    return prisma.$transaction((tx) => content.importDetailPage(ownerTransaction(tx), input));
  }

  it('keeps one active workspace per selling product however often or concurrently it is ensured', async () => {
    const salesProductId = randomUUID();
    const ensured = await Promise.all([1, 2, 3].map(() => ensureWorkspace(salesProductId)));

    expect(new Set(ensured.map((row) => row.workspaceId)).size).toBe(1);
    await expect(prisma.contentWorkspace.count({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId, status: 'active', isDeleted: false },
    })).resolves.toBe(1);
  });

  it('makes the first imported detail the current revision the mall reads', async () => {
    const { salesProductId, workspaceId } = await ensureWorkspace();

    const result = await importDetail(importInput(salesProductId));

    expect(result).toMatchObject({ kind: 'appended', workspaceId, becameCurrent: true });
    const read = await content.readRegistrableDetailPage({
      organizationId: TEST_ORGANIZATION_ID, salesProductId, revisionId: null,
    });
    expect(read).toMatchObject({
      workspaceId,
      revisionType: 'imported',
      html: '<p>사방넷 상세</p>',
    });
    expect(read).not.toHaveProperty('extraHtml');
    expect(read?.revisionId).toBe(result.kind === 'appended' ? result.revisionId : null);
  });

  it('keeps the import bookkeeping on the revision row itself, inside one imported detail page per source', async () => {
    const { salesProductId, workspaceId } = await ensureWorkspace();

    const first = await importDetail(importInput(salesProductId));
    const second = await importDetail(importInput(salesProductId, { html: '<p>두 번째</p>', digest: 'digest-2' }));

    const revisions = await prisma.detailPageRevision.findMany({
      where: { id: { in: [first, second].map((result) => (result.kind === 'appended' ? result.revisionId : '')) } },
      orderBy: { createdAt: 'asc' },
      select: { source: true, sourceDigest: true, revisionType: true, detailPage: { select: { id: true, source: true } } },
    });
    expect(revisions).toMatchObject([
      { source: 'sabangnet', sourceDigest: 'digest-1', revisionType: 'imported', detailPage: { source: 'imported' } },
      { source: 'sabangnet', sourceDigest: 'digest-2', revisionType: 'imported', detailPage: { source: 'imported' } },
    ]);
    expect(revisions[0]!.detailPage.id).toBe(revisions[1]!.detailPage.id);
    await expect(prisma.detailPage.count({ where: { contentWorkspaceId: workspaceId } })).resolves.toBe(1);
  });

  it('compares a re-import with the newest imported revision of that source — an older digest coming back appends', async () => {
    const { salesProductId } = await ensureWorkspace();
    await importDetail(importInput(salesProductId));
    await importDetail(importInput(salesProductId, { html: '<p>두 번째</p>', digest: 'digest-2' }));

    await expect(importDetail(importInput(salesProductId, { html: '<p>사방넷 상세</p>', digest: 'digest-1' })))
      .resolves.toMatchObject({ kind: 'appended', becameCurrent: true });
    await expect(importDetail(importInput(salesProductId, { html: '<p>사방넷 상세</p>', digest: 'digest-1' })))
      .resolves.toMatchObject({ kind: 'skipped', reason: 'unchanged' });
    await expect(prisma.detailPageRevision.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      orderBy: { createdAt: 'asc' },
      select: { sourceDigest: true },
    })).resolves.toEqual([{ sourceDigest: 'digest-1' }, { sourceDigest: 'digest-2' }, { sourceDigest: 'digest-1' }]);
  });

  it('does not add a revision when the same content is imported again', async () => {
    const { salesProductId } = await ensureWorkspace();
    await importDetail(importInput(salesProductId));

    await expect(importDetail(importInput(salesProductId))).resolves.toMatchObject({ kind: 'skipped', reason: 'unchanged' });
    await expect(prisma.detailPageRevision.count({ where: { organizationId: TEST_ORGANIZATION_ID } })).resolves.toBe(1);
  });

  it('replaces an earlier import but never a human edit — a re-import after the edit only joins the history', async () => {
    const { salesProductId } = await ensureWorkspace();
    await importDetail(importInput(salesProductId));
    const second = await importDetail(importInput(salesProductId, { html: '<p>두 번째</p>', digest: 'digest-2' }));
    expect(second).toMatchObject({ kind: 'appended', becameCurrent: true });

    const importedPage = await prisma.detailPage.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, source: 'imported' },
    });
    const edited = await prisma.$transaction((tx) => detailPages.appendRevision(ownerTransaction(tx), {
      organizationId: TEST_ORGANIZATION_ID,
      detailPageId: importedPage.id,
      revisionType: 'manual_edit',
      html: '<p>사람이 고친 상세</p>',
      imageUrls: [],
      createdByUserId: TEST_USER_ID,
    }));
    const editedRevisionId = edited.id;

    const third = await importDetail(importInput(salesProductId, { html: '<p>세 번째</p>', digest: 'digest-3' }));

    expect(third).toMatchObject({ kind: 'appended', becameCurrent: false });
    await expect(content.readRegistrableDetailPage({
      organizationId: TEST_ORGANIZATION_ID, salesProductId, revisionId: null,
    })).resolves.toMatchObject({ revisionId: editedRevisionId, revisionType: 'manual_edit', html: '<p>사람이 고친 상세</p>' });
    await expect(prisma.detailPageRevision.findUniqueOrThrow({
      where: { id: editedRevisionId }, select: { source: true, sourceDigest: true },
    })).resolves.toEqual({ source: null, sourceDigest: null });
    await expect(prisma.detailPageRevision.findUniqueOrThrow({
      where: { id: third.kind === 'appended' ? third.revisionId : '' }, select: { source: true, sourceDigest: true },
    })).resolves.toEqual({ source: 'sabangnet', sourceDigest: 'digest-3' });
    await expect(prisma.detailPageRevision.count({
      where: { organizationId: TEST_ORGANIZATION_ID, revisionType: 'imported' },
    })).resolves.toBe(3);
  });

  it('writes a first detail page by hand into a workspace with none, and refuses a second one', async () => {
    const { salesProductId, workspaceId } = await ensureWorkspace();

    const created = await content.createManualDetailPage({
      organizationId: TEST_ORGANIZATION_ID, salesProductId, html: '<p>직접 쓴 상세 <img src="https://cdn.example/a.jpg"></p>', createdByUserId: TEST_USER_ID,
    });

    expect(created.workspaceId).toBe(workspaceId);
    await expect(content.readRegistrableDetailPage({
      organizationId: TEST_ORGANIZATION_ID, salesProductId, revisionId: null,
    })).resolves.toMatchObject({
      revisionId: created.revisionId,
      revisionType: 'manual_edit',
      html: '<p>직접 쓴 상세 <img src="https://cdn.example/a.jpg"></p>',
      imageUrls: ['https://cdn.example/a.jpg'],
    });
    // 허브가 읽고 고치는 상세 페이지(직접 작성)의 현재 revision 이 그 글이다.
    await expect(detailPages.findById({ organizationId: TEST_ORGANIZATION_ID, detailPageId: created.detailPageId }))
      .resolves.toMatchObject({ source: 'manual', status: 'ready', contentWorkspaceId: workspaceId, currentRevisionId: created.revisionId });

    await expect(content.createManualDetailPage({
      organizationId: TEST_ORGANIZATION_ID, salesProductId, html: '<p>또 쓴 상세</p>', createdByUserId: TEST_USER_ID,
    })).rejects.toMatchObject({ code: 'STATE_CONFLICT', details: { reason: 'DETAIL_PAGE_ALREADY_EXISTS' } });
    await expect(prisma.detailPageRevision.count({ where: { organizationId: TEST_ORGANIZATION_ID } })).resolves.toBe(1);
  });

  it('has no manual first detail page for a product without a workspace', async () => {
    await expect(content.createManualDetailPage({
      organizationId: TEST_ORGANIZATION_ID, salesProductId: randomUUID(), html: '<p>상세</p>', createdByUserId: null,
    })).rejects.toMatchObject({ code: 'CONTENT_NOT_FOUND', details: { reason: 'workspace' } });
  });

  it('reads the revision a target selected instead of the current one', async () => {
    const { salesProductId } = await ensureWorkspace();
    const first = await importDetail(importInput(salesProductId));
    await importDetail(importInput(salesProductId, { html: '<p>새 상세</p>', digest: 'digest-2' }));
    const firstRevisionId = first.kind === 'appended' ? first.revisionId : '';

    await expect(content.readRegistrableDetailPage({
      organizationId: TEST_ORGANIZATION_ID, salesProductId, revisionId: firstRevisionId,
    })).resolves.toMatchObject({ revisionId: firstRevisionId, html: '<p>사방넷 상세</p>' });
    await expect(content.readRegistrableDetailPage({
      organizationId: TEST_ORGANIZATION_ID, salesProductId, revisionId: null,
    })).resolves.toMatchObject({ html: '<p>새 상세</p>' });
  });

  it('reads many products\' details in one call — a chosen revision, the current one, and none for a product without a workspace', async () => {
    const chosen = await ensureWorkspace();
    const current = await ensureWorkspace();
    const withoutWorkspace = randomUUID();
    const first = await importDetail(importInput(chosen.salesProductId, { html: '<p>고른 상세</p>', digest: 'digest-a' }));
    await importDetail(importInput(chosen.salesProductId, { html: '<p>새 상세</p>', digest: 'digest-b' }));
    await importDetail(importInput(current.salesProductId, { html: '<p>현재 상세</p>' }));
    const chosenRevisionId = first.kind === 'appended' ? first.revisionId : '';

    const pages = await content.readRegistrableDetailPages({
      organizationId: TEST_ORGANIZATION_ID,
      requests: [
        { salesProductId: chosen.salesProductId, revisionId: chosenRevisionId },
        { salesProductId: current.salesProductId, revisionId: null },
        { salesProductId: withoutWorkspace, revisionId: null },
      ],
    });

    expect([...pages.keys()].sort()).toEqual([chosen.salesProductId, current.salesProductId].sort());
    expect(pages.get(chosen.salesProductId)).toMatchObject({
      workspaceId: chosen.workspaceId, revisionId: chosenRevisionId, revisionType: 'imported', html: '<p>고른 상세</p>',
    });
    expect(pages.get(current.salesProductId)).toMatchObject({ workspaceId: current.workspaceId, html: '<p>현재 상세</p>' });
    await expect(content.readRegistrableDetailPages({ organizationId: TEST_ORGANIZATION_ID, requests: [] }))
      .resolves.toEqual(new Map());
  });

  it('rejects a batch that names another product\'s revision, like the single read does', async () => {
    const own = await ensureWorkspace();
    const foreign = await ensureWorkspace();
    const foreignImport = await importDetail(importInput(foreign.salesProductId));
    const foreignRevisionId = foreignImport.kind === 'appended' ? foreignImport.revisionId : '';

    await expect(content.readRegistrableDetailPages({
      organizationId: TEST_ORGANIZATION_ID,
      requests: [
        { salesProductId: foreign.salesProductId, revisionId: null },
        { salesProductId: own.salesProductId, revisionId: foreignRevisionId },
      ],
    })).rejects.toMatchObject({ code: 'CONTENT_SELECTION_INVALID', details: { reason: 'DETAIL_REVISION_NOT_OWNED' } });
    await expect(content.readRegistrableDetailPages({
      organizationId: TEST_ORGANIZATION_ID,
      requests: [{ salesProductId: randomUUID(), revisionId: foreignRevisionId }],
    })).rejects.toMatchObject({ code: 'CONTENT_SELECTION_INVALID', details: { reason: 'DETAIL_REVISION_NOT_OWNED' } });
  });

  it('has no detail for a product without a revision', async () => {
    const { salesProductId } = await ensureWorkspace();

    await expect(content.readRegistrableDetailPage({
      organizationId: TEST_ORGANIZATION_ID, salesProductId, revisionId: null,
    })).resolves.toBeNull();
    await expect(content.readRegistrableDetailPage({
      organizationId: TEST_ORGANIZATION_ID, salesProductId: randomUUID(), revisionId: null,
    })).resolves.toBeNull();
  });

  it('fills an empty selection with the current revision and thumbnail asset, and rejects another workspace\'s content', async () => {
    const own = await ensureWorkspace();
    const foreign = await ensureWorkspace();
    const ownImport = await importDetail(importInput(own.salesProductId));
    const foreignImport = await importDetail(importInput(foreign.salesProductId));
    const ownAsset = await createWorkspaceAsset(prisma, own.workspaceId, 'https://cdn.example.com/own.jpg', { current: true });
    const foreignAsset = await createWorkspaceAsset(prisma, foreign.workspaceId, 'https://cdn.example.com/foreign.jpg');
    const ownRevisionId = ownImport.kind === 'appended' ? ownImport.revisionId : '';
    const foreignRevisionId = foreignImport.kind === 'appended' ? foreignImport.revisionId : '';
    const select = (selection: { selectedThumbnailAssetId: string | null; selectedDetailPageRevisionId: string | null }) => ({
      organizationId: TEST_ORGANIZATION_ID, sourceWorkspaceId: own.workspaceId, ...selection,
    });

    await expect(prisma.$transaction((tx) => content.resolveSourceSelections(
      ownerTransaction(tx), select({ selectedThumbnailAssetId: null, selectedDetailPageRevisionId: null }),
    ))).resolves.toEqual({ selectedThumbnailAssetId: ownAsset, selectedDetailPageRevisionId: ownRevisionId });

    await expect(content.validateSourceSelections(null, select({
      selectedThumbnailAssetId: ownAsset, selectedDetailPageRevisionId: ownRevisionId,
    }))).resolves.toBeUndefined();
    await expect(content.validateSourceSelections(null, select({
      selectedThumbnailAssetId: foreignAsset, selectedDetailPageRevisionId: null,
    }))).rejects.toMatchObject({ code: 'CONTENT_SELECTION_INVALID', details: { reason: 'THUMBNAIL_ASSET_NOT_OWNED' } });
    await expect(content.validateSourceSelections(null, select({
      selectedThumbnailAssetId: null, selectedDetailPageRevisionId: foreignRevisionId,
    }))).rejects.toMatchObject({ code: 'CONTENT_SELECTION_INVALID', details: { reason: 'DETAIL_REVISION_NOT_OWNED' } });
    await expect(content.readRegistrableDetailPage({
      organizationId: TEST_ORGANIZATION_ID, salesProductId: own.salesProductId, revisionId: foreignRevisionId,
    })).rejects.toMatchObject({ code: 'CONTENT_SELECTION_INVALID', details: { reason: 'DETAIL_REVISION_NOT_OWNED' } });
  });

  it('rejects a detail-page photo of the source workspace as the selected thumbnail', async () => {
    const own = await ensureWorkspace();
    const detailPhoto = await prisma.contentAsset.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, contentWorkspaceId: own.workspaceId, source: 'upload',
      assetKey: `test:${randomUUID()}`, url: 'https://cdn.example.com/detail.jpg', assetType: 'image', role: 'detail_image',
    } });

    await expect(content.validateSourceSelections(null, {
      organizationId: TEST_ORGANIZATION_ID, sourceWorkspaceId: own.workspaceId,
      selectedThumbnailAssetId: detailPhoto.id, selectedDetailPageRevisionId: null,
    })).rejects.toMatchObject({ code: 'CONTENT_SELECTION_INVALID', details: { reason: 'THUMBNAIL_ASSET_NOT_OWNED' } });
  });

  it('waits for the selected asset lock and rejects an asset deleted meanwhile', async () => {
    const { workspaceId } = await ensureWorkspace();
    const assetId = await createWorkspaceAsset(prisma, workspaceId, 'https://cdn.example.com/selected.jpg');

    let releaseDelete!: () => void;
    let reportLocked!: () => void;
    const deleteRelease = new Promise<void>((resolve) => { releaseDelete = resolve; });
    const locked = new Promise<void>((resolve) => { reportLocked = resolve; });
    const deletion = prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM content_assets WHERE id = ${assetId}::uuid FOR UPDATE`);
      reportLocked();
      await deleteRelease;
      await tx.contentAsset.update({ where: { id: assetId }, data: { isDeleted: true, deletedAt: new Date() } });
    });
    await locked;

    const resolve = prisma.$transaction((tx) => content.resolveSourceSelections(ownerTransaction(tx), {
      organizationId: TEST_ORGANIZATION_ID,
      sourceWorkspaceId: workspaceId,
      selectedThumbnailAssetId: assetId,
      selectedDetailPageRevisionId: null,
    }));
    const observation = await Promise.race([
      resolve.then(() => 'settled' as const, () => 'settled' as const),
      new Promise<'blocked'>((done) => setTimeout(() => done('blocked'), 100)),
    ]);
    releaseDelete();

    await expect(deletion).resolves.toBeUndefined();
    await expect(resolve).rejects.toMatchObject({ code: 'CONTENT_SELECTION_INVALID', details: { reason: 'THUMBNAIL_ASSET_UNAVAILABLE' } });
    expect(observation).toBe('blocked');
  });
});

async function createWorkspaceAsset(
  prisma: PrismaClient,
  workspaceId: string,
  url: string,
  options: { current?: boolean } = {},
): Promise<string> {
  const asset = await prisma.contentAsset.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspaceId,
      source: 'upload',
      assetKey: `test:${randomUUID()}`,
      url,
      assetType: 'image',
      role: 'thumbnail',
    },
  });
  if (options.current) {
    await prisma.contentWorkspace.update({
      where: { id: workspaceId },
      data: { currentThumbnailAssetId: asset.id },
    });
  }
  return asset.id;
}
