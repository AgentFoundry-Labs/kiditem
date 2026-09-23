import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID as OTHER,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import { ListingThumbnailEvaluationRepositoryAdapter } from '../adapter/out/repository/listing-thumbnail-evaluation.repository.adapter';
import { ListingThumbnailEvaluationService } from '../application/service/listing-thumbnail-evaluation.service';
import { ThumbnailVisionAiService } from '../application/service/thumbnail-vision-ai.service';
import type { ThumbnailVisionProviderPort } from '../application/port/out/provider/thumbnail-vision-provider.port';

// 1x1 PNG — 규칙 검사(해상도 · 비율)가 실제 픽셀을 읽는다.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
  '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);

/** Gemini 는 외부 경계라 provider 만 바꾼다. 부른 모델과 URL 을 적는다. */
function fakeVisionProvider(score: () => number) {
  const calls: Array<{ model: string | undefined; parts: number }> = [];
  const provider: ThumbnailVisionProviderPort = {
    fetchImageBytes: async () => ({ data: PNG.toString('base64'), mimeType: 'image/png' }),
    fetchTrustedStorageImage: async () => ({ buffer: PNG, mimeType: 'image/png', storageKey: null }),
    assertConfigured: () => undefined,
    callVisionForJsonArray: async <T,>(contents: { contents: Array<{ parts: unknown[] }> }, _code: string, _signal?: AbortSignal, options?: { model?: string }) => {
      calls.push({ model: options?.model, parts: contents.contents[0]!.parts.length });
      return [{
        index: 0,
        overallScore: score(),
        scores: { visibility: 80, background: 90, composition: 85, clarity: 88, appeal: 82 },
        issues: [{ type: 'text', severity: 'low', message: '문구가 작다' }],
        suggestions: ['상품을 더 크게'],
      }] as T[];
    },
    callVerifyForJsonObject: async () => { throw new Error('verify is not part of the evaluation'); },
    callVisionForJsonText: async () => null,
    raceWithAbort: (promise) => promise,
    throwIfAborted: () => undefined,
  };
  return { provider, calls };
}

describe('listing thumbnail evaluation (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ListingThumbnailEvaluationService;
  let vision: ReturnType<typeof fakeVisionProvider>;
  let nextScore = 85;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    nextScore = 85;
    vision = fakeVisionProvider(() => nextScore);
    service = new ListingThumbnailEvaluationService(
      new ListingThumbnailEvaluationRepositoryAdapter(prisma as unknown as PrismaService),
      new ThumbnailVisionAiService(vision.provider, { complianceParts: () => [] } as never, {} as never),
    );
  });

  it('evaluates a listing image once with the chosen model and keeps the grade, score and details', async () => {
    const listingId = randomUUID();
    const first = await service.evaluate({ organizationId: ORG, channelListingId: listingId, imageUrl: 'https://mall/a.jpg', modelId: 'vision-model-x' });
    const again = await service.evaluate({ organizationId: ORG, channelListingId: listingId, imageUrl: 'https://mall/a.jpg', modelId: 'vision-model-y' });

    expect(first).toMatchObject({
      channelListingId: listingId,
      imageUrl: 'https://mall/a.jpg',
      grade: 'A',
      score: 85,
      method: 'vision_model',
      modelId: 'vision-model-x',
      details: {
        scores: { visibility: 80, background: 90, composition: 85, clarity: 88, appeal: 82 },
        issues: [{ type: 'text', severity: 'low', message: '문구가 작다' }],
        suggestions: ['상품을 더 크게'],
      },
    });
    expect(again).toEqual(first);
    expect(vision.calls).toEqual([{ model: 'vision-model-x', parts: 2 }]);
    await expect(prisma.listingThumbnailEvaluation.count()).resolves.toBe(1);
  });

  it('writes a new row when the mall shows a new image and keeps the old evaluation', async () => {
    const listingId = randomUUID();
    await service.evaluate({ organizationId: ORG, channelListingId: listingId, imageUrl: 'https://mall/a.jpg', modelId: 'm' });
    nextScore = 42;
    const changed = await service.evaluate({ organizationId: ORG, channelListingId: listingId, imageUrl: 'https://mall/b.jpg', modelId: 'm' });

    expect(changed).toMatchObject({ imageUrl: 'https://mall/b.jpg', grade: 'F', score: 42 });
    const rows = await prisma.listingThumbnailEvaluation.findMany({ where: { channelListingId: listingId }, orderBy: { imageUrl: 'asc' } });
    expect(rows.map((row) => [row.imageUrl, row.grade])).toEqual([['https://mall/a.jpg', 'A'], ['https://mall/b.jpg', 'F']]);
  });

  it('reads the evaluation of each listing current image and counts the grades', async () => {
    const [a, b, c, d] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await service.evaluate({ organizationId: ORG, channelListingId: a, imageUrl: 'https://mall/a.jpg', modelId: 'm' });
    nextScore = 65;
    await service.evaluate({ organizationId: ORG, channelListingId: b, imageUrl: 'https://mall/b-old.jpg', modelId: 'm' });
    await service.evaluate({ organizationId: ORG, channelListingId: c, imageUrl: 'https://mall/c.jpg', modelId: 'm' });

    const current = await service.readCurrentWithSummary({
      organizationId: ORG,
      listings: [
        { channelListingId: a, imageUrl: 'https://mall/a.jpg' },
        { channelListingId: b, imageUrl: 'https://mall/b-new.jpg' },
        { channelListingId: c, imageUrl: 'https://mall/c.jpg' },
        { channelListingId: d, imageUrl: null },
      ],
    });

    expect(current.evaluations.map((row) => [row.channelListingId, row.grade])).toEqual([[a, 'A'], [c, 'C']]);
    expect(current.summary).toEqual({ evaluated: 2, unevaluated: 1, byGrade: { S: 0, A: 1, B: 0, C: 1, D: 0, F: 0 } });
  });

  it('requires an explicit model and keeps evaluations inside one organization', async () => {
    const listingId = randomUUID();
    await expect(service.evaluate({ organizationId: ORG, channelListingId: listingId, imageUrl: 'https://mall/a.jpg', modelId: '  ' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(vision.calls).toEqual([]);

    await service.evaluate({ organizationId: ORG, channelListingId: listingId, imageUrl: 'https://mall/a.jpg', modelId: 'm' });
    const foreign = await service.readCurrentWithSummary({
      organizationId: OTHER,
      listings: [{ channelListingId: listingId, imageUrl: 'https://mall/a.jpg' }],
    });
    expect(foreign.evaluations).toEqual([]);
  });

  it('returns the size and ratio checks of the fetched image without storing them', async () => {
    const listingId = randomUUID();
    const result = await service.evaluateWithImageSpec({ organizationId: ORG, channelListingId: listingId, imageUrl: 'https://mall/a.jpg', modelId: 'm' });

    expect(result.imageSpec).toMatchObject({ width: 1, height: 1 });
    const stored = await prisma.listingThumbnailEvaluation.findFirstOrThrow({ where: { channelListingId: listingId } });
    expect(stored.details).not.toHaveProperty('imageSpec');
  });
});
