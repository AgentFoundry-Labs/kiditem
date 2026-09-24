import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import { AiDirectJobRepositoryAdapter } from '../adapter/out/repository/ai-direct-job.repository.adapter';
import { DetailPageRepositoryAdapter } from '../adapter/out/repository/detail-page.repository.adapter';
import { DetailPageGenerationRepositoryAdapter } from '../adapter/out/repository/detail-page-generation.repository.adapter';
import { DetailPageGenerationSinkAdapter } from '../adapter/out/direct-output/detail-page-generation-sink.adapter';
import { DetailPageGenerateDirectOutputSchema } from '../domain/direct-generation';
import type { DetailPageRawInput } from '../application/service/detail-page-ai.types';

/**
 * AI 상세 생성 = `generated` 상세 페이지 하나(KID-313 W3b). 입력 · 결과 사진은 워크스페이스 자산이고, sink 는
 * 결과(`generation_result`)를 적으며 `processing → ready` 로 옮긴다 — 결과 없이 상태만 바꾸지 않고, revision 은
 * 웹이 처음 그린 HTML 을 저장할 때 붙는다.
 */
describe('detail page generation (PG integration)', () => {
  let prisma: PrismaClient;
  let pages: DetailPageRepositoryAdapter;
  let generations: DetailPageGenerationRepositoryAdapter;
  let sink: DetailPageGenerationSinkAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const service = prisma as unknown as PrismaService;
    pages = new DetailPageRepositoryAdapter(service);
    generations = new DetailPageGenerationRepositoryAdapter(service, pages, new AiDirectJobRepositoryAdapter(service));
    sink = new DetailPageGenerationSinkAdapter(pages);
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

  const rawInput: DetailPageRawInput = {
    rawTitle: '말랑 장화',
    rawCategory: '신발',
    rawDescription: '',
    rawOptions: '',
    imageUrls: ['https://cdn.example/in-1.jpg', 'https://cdn.example/in-2.jpg'],
    heroImageMode: 'first',
    templateId: 'bold-vertical',
    sourceReferences: [{ sourceType: 'sourcing_candidate', sourceCandidateId: randomUUID(), label: '수집 원천' }],
  };

  function open(contentWorkspaceId: string) {
    return generations.openGeneration({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId,
      triggeredByUserId: TEST_USER_ID,
      templateId: 'bold-vertical',
      rawInput,
      imageUrls: rawInput.imageUrls,
      title: '말랑 장화',
      directJob: {
        jobType: 'detail_page_generate',
        payload: {
          jobType: 'detail_page_generate',
          models: { image: 'gemini-image-model', text: 'gemini-text-model', vision: 'gemini-vision-model' },
          input: {
            templateId: 'bold-vertical',
            generationMode: 'full',
            raw: {
              rawTitle: '말랑 장화', rawCategory: '신발', rawDescription: '', rawOptions: '', imageUrls: rawInput.imageUrls,
              ageGroup: 'age-8-plus', detailImageCount: '2', usageSectionMode: 'include',
              kcCertificationStatus: 'unknown', kcCertificationNumber: '',
            },
            heroImageMode: 'first',
          },
        },
        status: 'held',
        scheduledFor: new Date(Date.now() + 60_000),
      },
    });
  }

  const output = DetailPageGenerateDirectOutputSchema.parse({
    templateId: 'bold-vertical',
    result: {
      hook: {
        subtext: '이달의 추천',
        text: '말랑',
        titleSub: '장화',
        description: '아이가 신기 쉬운 가벼운 장화',
        imageIndex: 0,
        bannerImageIndex: null,
      },
      section: { name: '말랑 장화', title: '가벼운 장화', subtitle: '가벼운 장화' },
      keyPoints: [
        { title: '가벼움', description: '신고 다녀도 부담이 없어요', imageIndex: 0 },
        { title: '논슬립', description: '미끄러짐 방지 밑창이에요', imageIndex: 0 },
        { title: '방수', description: '비 오는 날에도 젖지 않아요', imageIndex: 0 },
      ],
      size: { subtitle: '130에서 200까지', imageIndices: [] },
      color: { subtitle: '노랑과 파랑', imageIndices: [] },
      usage: { subtitle: '발을 넣고 신어요', imageIndices: [] },
      detailImageIndices: [0],
      productInfo: [
        { key: '제품명', value: '말랑 장화' },
        { key: '재질', value: '고무' },
        { key: '색상', value: '노랑과 파랑' },
      ],
    },
    imageUrls: rawInput.imageUrls,
    processedImages: { __heroBanner: 'https://cdn.example/hero.png' },
  });

  function succeed(detailPageId: string) {
    return sink.applySuccess({
      organizationId: TEST_ORGANIZATION_ID, requestId: 'direct-ai:job', runId: undefined, sourceResourceId: detailPageId, output,
    });
  }

  it('opens a pending generated page with its input photos as workspace assets and a held job keyed by the page', async () => {
    const workspaceId = await workspace();

    const opened = await open(workspaceId);

    expect(opened).toMatchObject({ status: 'created', releaseRequired: true, page: { source: 'generated', status: 'pending', title: '말랑 장화' } });
    expect(opened.page.generationInput).toMatchObject({ rawTitle: '말랑 장화', sourceReferences: [{ sourceType: 'sourcing_candidate' }] });
    await expect(prisma.aiDirectJob.findUniqueOrThrow({ where: { id: opened.directJobId } }))
      .resolves.toMatchObject({ sourceResourceId: opened.page.id, status: 'held' });
    await expect(prisma.contentAsset.findMany({
      where: { contentWorkspaceId: workspaceId }, orderBy: { sortOrder: 'asc' }, select: { url: true, role: true, source: true },
    })).resolves.toEqual([
      { url: 'https://cdn.example/in-1.jpg', role: 'detail_source', source: 'detail_generation' },
      { url: 'https://cdn.example/in-2.jpg', role: 'detail_source', source: 'detail_generation' },
    ]);
  });

  it('records the result and the generated photos and moves the page to ready — no revision until the HTML is saved', async () => {
    const workspaceId = await workspace();
    const { page } = await open(workspaceId);

    await succeed(page.id);
    await succeed(page.id); // 두 번째 결과는 끝난 페이지를 건드리지 않는다.

    const done = await pages.findById({ organizationId: TEST_ORGANIZATION_ID, detailPageId: page.id });
    expect(done).toMatchObject({ status: 'ready', title: '말랑 장화', currentRevisionId: null, errorMessage: null });
    expect(done?.generationResult).toMatchObject({
      templateId: 'bold-vertical',
      result: { hook: { text: '말랑' } },
      imageUrls: rawInput.imageUrls,
      processedImages: { __heroBanner: 'https://cdn.example/hero.png' },
    });
    await expect(prisma.contentAsset.findMany({
      where: { contentWorkspaceId: workspaceId, role: 'detail_image' }, select: { url: true, label: true },
    })).resolves.toEqual([{ url: 'https://cdn.example/hero.png', label: '__heroBanner' }]);
    await expect(prisma.detailPageRevision.count()).resolves.toBe(0);
    await expect(prisma.contentWorkspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { currentDetailPageRevisionId: true } }))
      .resolves.toEqual({ currentDetailPageRevisionId: null });
  });

  it('records a failure with its message, and a cancelled generation ignores a late result', async () => {
    const workspaceId = await workspace();
    const failed = await open(workspaceId);
    await sink.applyFailure({
      organizationId: TEST_ORGANIZATION_ID, requestId: 'direct-ai:job', runId: undefined,
      sourceResourceId: failed.page.id, errorCode: 'provider_error', errorMessage: '모델 오류',
    });
    await expect(pages.findById({ organizationId: TEST_ORGANIZATION_ID, detailPageId: failed.page.id }))
      .resolves.toMatchObject({ status: 'failed', errorMessage: '모델 오류' });

    const other = await prisma.contentWorkspace.create({
      data: { organizationId: TEST_ORGANIZATION_ID, ownerType: 'direct_detail_page', normalizedTitle: '장화', status: 'active' },
    });
    const cancelled = await open(other.id);
    await expect(generations.cancelDirectGeneration({
      organizationId: TEST_ORGANIZATION_ID, detailPageId: cancelled.page.id, reason: '사용자 요청으로 생성이 중단되었습니다.',
    })).resolves.toMatchObject({ status: 'cancelled', preserved: false });
    await succeed(cancelled.page.id);

    await expect(pages.findById({ organizationId: TEST_ORGANIZATION_ID, detailPageId: cancelled.page.id }))
      .resolves.toMatchObject({ status: 'failed', errorMessage: '사용자 요청으로 생성이 중단되었습니다.', generationResult: {} });
    await expect(prisma.aiDirectJob.findUniqueOrThrow({ where: { id: cancelled.directJobId } }))
      .resolves.toMatchObject({ status: 'cancelled', lastErrorCode: 'user_cancelled' });
    await expect(generations.cancelDirectGeneration({
      organizationId: TEST_ORGANIZATION_ID, detailPageId: cancelled.page.id, reason: '또',
    })).resolves.toMatchObject({ status: 'already_terminal' });
  });

  it('offers only ready generations of the same workspace and template, with their recorded result, as an image-only base', async () => {
    const workspaceId = await workspace();
    const ready = await open(workspaceId);
    await succeed(ready.page.id);
    await open(workspaceId); // 아직 pending

    const bases = await generations.findImageOnlyBaseCandidates({
      organizationId: TEST_ORGANIZATION_ID, contentWorkspaceId: workspaceId, templateId: 'bold-vertical',
    });

    expect(bases.map((base) => base.id)).toEqual([ready.page.id]);
    expect(bases[0]?.generationResult).toMatchObject({ result: { hook: { text: '말랑' } } });
    await expect(generations.findImageOnlyBaseCandidates({
      organizationId: TEST_ORGANIZATION_ID, contentWorkspaceId: workspaceId, templateId: 'kids-playful',
    })).resolves.toEqual([]);
  });
});
