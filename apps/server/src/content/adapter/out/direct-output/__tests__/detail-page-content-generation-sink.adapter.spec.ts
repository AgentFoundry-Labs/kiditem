import { describe, expect, it, vi } from 'vitest';
import { DetailPageGenerateDirectOutputSchema } from '../../../../domain/direct-generation';
import { DetailPageContentGenerationSinkAdapter } from '../detail-page-content-generation-sink.adapter';

const ORG = '11111111-1111-1111-1111-111111111111';
const REQUEST = '22222222-2222-2222-2222-222222222222';
const RUN = '33333333-3333-3333-3333-333333333333';
const CG_ID = '44444444-4444-4444-4444-444444444444';
const ARTIFACT_ID = '55555555-5555-5555-8555-555555555555';

const VALID_OUTPUT = DetailPageGenerateDirectOutputSchema.parse({
  templateId: 'bold-vertical',
  result: {
    hook: {
      subtext: '이달의 추천',
      text: '키즈 텀블러',
      titleSub: '안심 음수',
      description: '아이가 들기 쉬운 휴대 텀블러',
      imageIndex: 0,
      bannerImageIndex: null,
    },
    section: {
      name: '키즈 텀블러',
      title: '안심 음수',
      subtitle: '안심 음수',
    },
    keyPoints: [
      { title: '가벼움', description: '들고 다녀도 부담이 없어요', imageIndex: 0 },
      { title: '논슬립', description: '미끄러짐 방지 그립이에요', imageIndex: 0 },
      { title: '안심 재질', description: '안전하게 사용하는 재질이에요', imageIndex: 0 },
    ],
    size: { subtitle: '500ml 표준', imageIndices: [] },
    color: { subtitle: '핑크와 블루', imageIndices: [] },
    usage: { subtitle: '뚜껑을 돌려 음수해요', imageIndices: [] },
    detailImageIndices: [0],
    productInfo: [
      { key: '제품명', value: '키즈 텀블러' },
      { key: '재질', value: '트라이탄' },
      { key: '색상', value: '핑크와 블루' },
    ],
  },
  imageUrls: ['https://example.com/p1.jpg'],
  processedImages: { __heroBanner: 'https://cdn.example.com/hero.png' },
});

function makeRow(status = 'PROCESSING') {
  return {
    id: CG_ID,
    organizationId: ORG,
    status,
    contentWorkspaceId: '66666666-6666-4666-8666-666666666666',
    detailPageArtifactId: null as string | null,
    generationGroupId: null,
    generatedTitle: null,
    triggeredByUserId: '77777777-7777-4777-8777-777777777777',
    generationInput: { rawTitle: '자석 다트게임' },
    generationResult: null,
  };
}

function makePrisma(row = makeRow()) {
  const tx = {
    contentGeneration: {
      updateMany: vi.fn()
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 }),
    },
    detailPageArtifact: {
      create: vi.fn().mockResolvedValue({ id: ARTIFACT_ID }),
      findFirstOrThrow: vi.fn().mockResolvedValue({ id: ARTIFACT_ID }),
    },
    contentWorkspace: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    contentGeneration: {
      findFirst: vi.fn().mockResolvedValue(row),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  return { prisma, tx };
}

function makeSink(prisma: unknown, contentAssets = { recordDetailPageGeneratedAssetsTx: vi.fn() }) {
  return new DetailPageContentGenerationSinkAdapter(
    prisma as never,
    {} as never,
    contentAssets as never,
  );
}

describe('DetailPageContentGenerationSinkAdapter', () => {
  it('does not create artifacts or assets when the apply claim loses cancellation', async () => {
    const { prisma, tx } = makePrisma();
    tx.contentGeneration.updateMany.mockReset().mockResolvedValue({ count: 0 });
    const contentAssets = { recordDetailPageGeneratedAssetsTx: vi.fn() };
    const sink = makeSink(prisma, contentAssets);

    await sink.applySuccess({
      organizationId: ORG,
      requestId: REQUEST,
      runId: RUN,
      sourceResourceId: CG_ID,
      output: VALID_OUTPUT,
    });

    expect(tx.detailPageArtifact.create).not.toHaveBeenCalled();
    expect(tx.contentWorkspace.updateMany).not.toHaveBeenCalled();
    expect(contentAssets.recordDetailPageGeneratedAssetsTx).not.toHaveBeenCalled();
  });

  it('projects provider output into the ContentGeneration owner transaction', async () => {
    const { prisma, tx } = makePrisma();
    const contentAssets = { recordDetailPageGeneratedAssetsTx: vi.fn() };
    const sink = makeSink(prisma, contentAssets);

    await sink.applySuccess({
      organizationId: ORG,
      requestId: REQUEST,
      runId: RUN,
      sourceResourceId: CG_ID,
      output: VALID_OUTPUT,
    });

    expect(tx.contentGeneration.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: CG_ID, organizationId: ORG, status: 'PROCESSING' },
      data: { status: 'APPLYING' },
    });
    expect(tx.detailPageArtifact.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: ORG,
        sourceContentGenerationId: CG_ID,
      }),
    }));
    expect(tx.contentGeneration.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: CG_ID, organizationId: ORG, status: 'APPLYING' },
      data: expect.objectContaining({ status: 'READY', detailPageArtifactId: ARTIFACT_ID }),
    }));
    expect(contentAssets.recordDetailPageGeneratedAssetsTx).toHaveBeenCalledWith(
      tx,
      {
        organizationId: ORG,
        contentGenerationId: CG_ID,
        generationGroupId: null,
        processedImages: VALID_OUTPUT.processedImages,
      },
    );
  });

  it('records provider failure on the ContentGeneration owner row', async () => {
    const row = makeRow();
    const { prisma } = makePrisma(row);
    prisma.contentGeneration.findFirst.mockResolvedValueOnce({
      id: row.id,
      status: row.status,
      generationInput: row.generationInput,
    });
    const sink = makeSink(prisma);

    await sink.applyFailure({
      organizationId: ORG,
      requestId: REQUEST,
      runId: undefined,
      sourceResourceId: CG_ID,
      errorCode: 'runtime_not_configured',
      errorMessage: 'no provider',
    });

    expect(prisma.contentGeneration.updateMany).toHaveBeenCalledWith({
      where: {
        id: CG_ID,
        organizationId: ORG,
        status: { notIn: ['READY', 'FAILED', 'CANCELLED', 'completed', 'failed', 'cancelled'] },
      },
      data: { status: 'FAILED', errorMessage: 'no provider' },
    });
  });

  it('does not project a terminal ContentGeneration on success or failure replay', async () => {
    for (const status of ['READY', 'FAILED']) {
      const { prisma } = makePrisma(makeRow(status));
      const sink = makeSink(prisma);

      await sink.applySuccess({
        organizationId: ORG,
        requestId: REQUEST,
        runId: undefined,
        sourceResourceId: CG_ID,
        output: VALID_OUTPUT,
      });
      await sink.applyFailure({
        organizationId: ORG,
        requestId: REQUEST,
        runId: undefined,
        sourceResourceId: CG_ID,
        errorCode: 'runtime_failed',
        errorMessage: 'terminal replay',
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.contentGeneration.updateMany).not.toHaveBeenCalled();
    }
  });

  it('reuses the existing artifact when a replay-compatible row is projected', async () => {
    const row = { ...makeRow(), detailPageArtifactId: ARTIFACT_ID };
    const { prisma, tx } = makePrisma(row);
    const sink = makeSink(prisma);

    await sink.applySuccess({
      organizationId: ORG,
      requestId: REQUEST,
      runId: RUN,
      sourceResourceId: CG_ID,
      output: VALID_OUTPUT,
    });

    expect(tx.detailPageArtifact.create).not.toHaveBeenCalled();
    expect(tx.detailPageArtifact.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: ARTIFACT_ID, organizationId: ORG },
      select: { id: true },
    });
    expect(tx.contentGeneration.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          detailPageArtifactId: ARTIFACT_ID,
          status: 'READY',
        }),
      }),
    );
  });

  it('persists the direct runtime output unchanged for a draft-only generation', async () => {
    const row = {
      ...makeRow(),
      generationInput: { rawTitle: '자석 다트게임', generationMode: 'draft' },
    };
    const { prisma, tx } = makePrisma(row);
    const contentAssets = { recordDetailPageGeneratedAssetsTx: vi.fn() };
    const sink = makeSink(prisma, contentAssets);

    await sink.applySuccess({
      organizationId: ORG,
      requestId: REQUEST,
      runId: RUN,
      sourceResourceId: CG_ID,
      output: { ...VALID_OUTPUT, processedImages: {} },
    });

    expect(contentAssets.recordDetailPageGeneratedAssetsTx).not.toHaveBeenCalled();
    expect(tx.contentGeneration.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationResult: {
            templateId: VALID_OUTPUT.templateId,
            result: VALID_OUTPUT.result,
            imageUrls: VALID_OUTPUT.imageUrls,
            processedImages: {},
          },
        }),
      }),
    );
  });

  it('fences a cross-organization projection before any owner write', async () => {
    const { prisma } = makePrisma();
    prisma.contentGeneration.findFirst.mockResolvedValueOnce(null);
    const sink = makeSink(prisma);

    await sink.applySuccess({
      organizationId: '99999999-9999-4999-8999-999999999999',
      requestId: REQUEST,
      runId: RUN,
      sourceResourceId: CG_ID,
      output: VALID_OUTPUT,
    });

    expect(prisma.contentGeneration.findFirst).toHaveBeenCalledWith({
      where: {
        id: CG_ID,
        organizationId: '99999999-9999-4999-8999-999999999999',
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not apply late success or failure after cancellation', async () => {
    const { prisma } = makePrisma(makeRow('CANCELLED'));
    const sink = makeSink(prisma);

    await sink.applySuccess({
      organizationId: ORG,
      requestId: REQUEST,
      runId: RUN,
      sourceResourceId: CG_ID,
      output: VALID_OUTPUT,
    });
    await sink.applyFailure({
      organizationId: ORG,
      requestId: REQUEST,
      runId: RUN,
      sourceResourceId: CG_ID,
      errorCode: 'runtime_failed',
      errorMessage: 'late provider failure',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not query or mutate without a source ContentGeneration id', async () => {
    const { prisma } = makePrisma();
    const sink = makeSink(prisma);

    await sink.applySuccess({
      organizationId: ORG,
      requestId: REQUEST,
      runId: undefined,
      sourceResourceId: null,
      output: VALID_OUTPUT,
    });
    await sink.applyFailure({
      organizationId: ORG,
      requestId: REQUEST,
      runId: undefined,
      sourceResourceId: null,
      errorCode: 'runtime_failed',
      errorMessage: 'missing source row',
    });

    expect(prisma.contentGeneration.findFirst).not.toHaveBeenCalled();
    expect(prisma.contentGeneration.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
