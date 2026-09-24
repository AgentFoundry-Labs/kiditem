import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeChannelListingQuery, makeChannelRecipes } from '../../test-helpers/channel-catalog-ports';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import { ThumbnailGenerationLedgerRepositoryAdapter } from '../adapter/out/repository/thumbnail-generation-ledger.repository.adapter';
import { ContentAssetLibraryRepositoryAdapter } from '../adapter/out/repository/content-asset-library.repository.adapter';
import { ThumbnailGenerationSinkAdapter } from '../adapter/out/direct-output/thumbnail-generation-sink.adapter';
import { ThumbnailGenerationLifecycleService } from '../application/service/thumbnail-generation-lifecycle.service';
import { ThumbnailGenerationService } from '../application/service/thumbnail-generation.service';
import { ThumbnailGenerationJobService } from '../application/service/thumbnail-generation-job.service';
import type { ThumbnailEditorInputImage } from '../domain/model/thumbnail-editor';

/**
 * 대표이미지 생성 job(KID-313 W3a): job 은 상태 · 방법 · 프롬프트 · 입력 메타 · 오류 · 시도만 갖고, 결과 후보는
 * 같은 트랜잭션에서 `content_assets`(source ai, role thumbnail, thumbnail_generation_id) 행이 된다.
 * 재편집은 `input_meta` 의 입력 사진을 다시 읽는다.
 */
describe('thumbnail job (PG integration)', () => {
  let prisma: PrismaClient;
  let ledger: ThumbnailGenerationLedgerRepositoryAdapter;
  let lifecycle: ThumbnailGenerationLifecycleService;
  let sink: ThumbnailGenerationSinkAdapter;
  let generations: ThumbnailGenerationService;
  let assets: ContentAssetLibraryRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    ledger = new ThumbnailGenerationLedgerRepositoryAdapter(
      prisma as unknown as PrismaService,
      {} as never,
      makeChannelListingQuery(prisma),
      makeChannelRecipes(prisma),
    );
    lifecycle = new ThumbnailGenerationLifecycleService(ledger);
    sink = new ThumbnailGenerationSinkAdapter(lifecycle, {
      getUrl: (key: string) => `https://cdn.example.com/${key}`,
    } as never);
    assets = new ContentAssetLibraryRepositoryAdapter(prisma as unknown as PrismaService);
    generations = new ThumbnailGenerationService(ledger, assets, {} as never);
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function seedPendingJob(inputMeta: Record<string, unknown> = { mode: 'edit' }) {
    const workspace = await prisma.contentWorkspace.create({
      data: { organizationId: TEST_ORGANIZATION_ID, ownerType: 'sales_product', salesProductId: randomUUID() },
    });
    const job = await prisma.thumbnailGeneration.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspace.id,
        status: 'pending',
        method: 'generate',
        inputMeta: inputMeta as never,
      },
    });
    return { workspaceId: workspace.id, jobId: job.id };
  }

  const succeed = (jobId: string, keys: string[]) => sink.applySuccess({
    organizationId: TEST_ORGANIZATION_ID,
    requestId: `request-${jobId}`,
    sourceResourceId: jobId,
    output: {
      candidates: keys.map((key) => ({
        url: `https://provider.example.com/${key}`,
        storageKey: key,
        filename: key,
        mimeType: 'image/png',
        fileSize: 100,
      })),
    },
  });

  it('writes the job result as AI candidate assets together with succeeded, once', async () => {
    const { workspaceId, jobId } = await seedPendingJob();

    await succeed(jobId, ['a.png', 'b.png']);
    await succeed(jobId, ['c.png']);

    await expect(prisma.thumbnailGeneration.findUniqueOrThrow({ where: { id: jobId } }))
      .resolves.toMatchObject({ status: 'succeeded', attemptCount: 1, errorMessage: null });
    const candidates = await prisma.contentAsset.findMany({
      where: { thumbnailGenerationId: jobId },
      orderBy: { sortOrder: 'asc' },
    });
    expect(candidates.map((row) => [row.url, row.source, row.role, row.contentWorkspaceId, row.isDeleted])).toEqual([
      ['https://cdn.example.com/a.png', 'ai', 'thumbnail', workspaceId, false],
      ['https://cdn.example.com/b.png', 'ai', 'thumbnail', workspaceId, false],
    ]);
    const gallery = await assets.listWorkspaceThumbnailGallery({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspaceId,
    });
    expect(gallery.map((row) => row.url).sort()).toEqual([
      'https://cdn.example.com/a.png',
      'https://cdn.example.com/b.png',
    ]);
  });

  it('lists jobs with their candidates as content assets', async () => {
    const { workspaceId, jobId } = await seedPendingJob();
    await succeed(jobId, ['a.png']);

    const listed = await generations.findAll(TEST_ORGANIZATION_ID, { contentWorkspaceId: workspaceId });

    expect(listed.items).toEqual([
      expect.objectContaining({ id: jobId, contentWorkspaceId: workspaceId, status: 'succeeded', method: 'generate' }),
    ]);
    expect(listed.candidates).toEqual([
      expect.objectContaining({
        url: 'https://cdn.example.com/a.png',
        source: 'ai',
        thumbnailGenerationId: jobId,
        isCurrentThumbnail: false,
      }),
    ]);
  });

  it('names each listed workspace with its sales product and the product name the job was started with', async () => {
    const { workspaceId, jobId } = await seedPendingJob({ mode: 'edit', productName: '자석 다트게임' });
    const workspace = await prisma.contentWorkspace.findUniqueOrThrow({ where: { id: workspaceId } });

    const listed = await generations.findOne(jobId, TEST_ORGANIZATION_ID);

    expect(listed.workspaces).toEqual([
      { id: workspaceId, salesProductId: workspace.salesProductId, name: '자석 다트게임', imageUrl: null },
    ]);
  });

  it('refuses to delete a job or remove a candidate that is the adopted representative image', async () => {
    const { workspaceId, jobId } = await seedPendingJob();
    await succeed(jobId, ['a.png', 'b.png']);
    const [adopted, spare] = await prisma.contentAsset.findMany({
      where: { thumbnailGenerationId: jobId },
      orderBy: { sortOrder: 'asc' },
    });
    await assets.setCurrentThumbnail({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspaceId,
      assetId: adopted!.id,
    });

    await expect(generations.deleteGeneration(jobId, TEST_ORGANIZATION_ID)).rejects.toMatchObject({ code: 'CONTENT_ASSET_IN_USE', details: { reason: 'ADOPTED_REPRESENTATIVE_IMAGE' } });
    await expect(generations.removeCandidate(jobId, TEST_ORGANIZATION_ID, adopted!.id))
      .rejects.toMatchObject({ code: 'CONTENT_ASSET_IN_USE', details: { reason: 'ADOPTED_REPRESENTATIVE_IMAGE' } });
    await expect(generations.removeCandidate(jobId, TEST_ORGANIZATION_ID, spare!.id))
      .resolves.toEqual({ ok: true, generationDeleted: false, remaining: 1 });
    await expect(prisma.contentAsset.findUniqueOrThrow({ where: { id: spare!.id } }))
      .resolves.toMatchObject({ isDeleted: true });
  });

  it('re-edits from the input photos kept in input_meta and replaces the candidates', async () => {
    const { workspaceId, jobId } = await seedPendingJob({
      mode: 'edit',
      originalUrl: 'https://cdn.example.com/original.png',
      editAnalysis: null,
      inputImages: [
        { url: 'https://cdn.example.com/front.png', storageKey: null, role: 'product', label: 'Front', sortOrder: 0, source: 'upload', sourceRecordImageId: null },
        { url: 'https://cdn.example.com/box.png', storageKey: null, role: 'box', label: 'Box', sortOrder: 1, source: 'upload', sourceRecordImageId: null },
      ],
    });
    await succeed(jobId, ['first.png']);

    await ledger.resetGenerationForReEdit({
      id: jobId,
      organizationId: TEST_ORGANIZATION_ID,
      purpose: 'quality',
      variantKey: 'auto',
    });
    const resolved: string[] = [];
    const editorAi = {
      resolveInputImage: async (url: string, _org: string, options: { label: string; role: string; sortOrder: number; source: string }) => {
        resolved.push(url);
        return {
          data: 'ZmFrZQ==',
          mimeType: 'image/png',
          url,
          storageKey: null,
          label: options.label,
          role: options.role,
          sortOrder: options.sortOrder,
          source: options.source,
          fileSize: 4,
        } as ThumbnailEditorInputImage;
      },
      generateEdit: async () => [
        { url: 'https://cdn.example.com/second.png', storageKey: 'second.png', filename: 'second.png', mimeType: 'image/png', fileSize: 5 },
      ],
    };
    const jobs = new ThumbnailGenerationJobService(ledger, editorAi as never, {} as never, lifecycle);

    await jobs.processEditJob(jobId, TEST_ORGANIZATION_ID, 'quality', 'auto', 'model-x');

    expect(resolved).toEqual(['https://cdn.example.com/front.png', 'https://cdn.example.com/box.png']);
    const live = await prisma.contentAsset.findMany({
      where: { thumbnailGenerationId: jobId, isDeleted: false },
      select: { url: true, contentWorkspaceId: true },
    });
    expect(live).toEqual([{ url: 'https://cdn.example.com/second.png', contentWorkspaceId: workspaceId }]);
    await expect(prisma.thumbnailGeneration.findUniqueOrThrow({ where: { id: jobId } }))
      .resolves.toMatchObject({ status: 'succeeded' });
  });
});
