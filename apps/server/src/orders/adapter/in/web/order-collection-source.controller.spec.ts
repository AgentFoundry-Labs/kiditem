import { describe, expect, it, vi } from 'vitest';
import { OrderCollectionSourceStatusSchema } from '@kiditem/shared/order-collection-source';
import { OrderCollectionSourceController } from './order-collection-source.controller';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = { id: '22222222-2222-4222-8222-222222222222' };
const ATTEMPT = '33333333-3333-4333-8333-333333333333';
const TOKEN = '44444444-4444-4444-8444-444444444444';
const ARTIFACT = '55555555-5555-4555-8555-555555555555';

describe('OrderCollectionSourceController', () => {
  it('passes the admitted browser date and automatic row criterion to the owner', async () => {
    const source = { beginAttempt: vi.fn().mockResolvedValue({ attemptId: ATTEMPT }) };
    const controller = new OrderCollectionSourceController(source as never, {} as never);

    await controller.beginAttempt(
      {
        mallKey: 'art09',
        collectionDate: '2026-09-10',
        collectionMode: 'browser',
        selectionMode: 'automatic',
        seenRowKeys: ['A-1\u001f연필'],
      },
      'order-key',
      ORG,
      USER as never,
    );

    expect(source.beginAttempt).toHaveBeenCalledWith({
      organizationId: ORG,
      userId: USER.id,
      idempotencyKey: 'order-key',
      mallKey: 'art09',
      collectionDate: '2026-09-10',
      collectionMode: 'browser',
      selectionMode: 'automatic',
      seenRowKeys: ['A-1\u001f연필'],
    });
  });

  it('allows raw-only failure evidence for unsupported conversion', async () => {
    const source = { failAttempt: vi.fn().mockResolvedValue({ state: 'FAILED' }) };
    const controller = new OrderCollectionSourceController(source as never, {} as never);

    await controller.failAttempt(
      ATTEMPT,
      TOKEN,
      ORG,
      {
        code: 'UNSUPPORTED_CONVERSION',
        message: 'Kakao conversion is not supported.',
        sourcePayload: [{ paymentId: 10 }],
      },
    );

    expect(source.failAttempt).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG,
      attemptId: ATTEMPT,
      attemptToken: TOKEN,
      code: 'UNSUPPORTED_CONVERSION',
      source: expect.objectContaining({
        contentType: 'application/json',
        bytes: Buffer.from('[{"paymentId":10}]'),
      }),
    }));
  });

  it('serves the raw source evidence with no-store caching', async () => {
    const source = {
      readSourceDownload: vi.fn().mockResolvedValue({
        bytes: Buffer.from('raw'),
        fileName: 'capture.json',
        contentType: 'application/json',
      }),
    };
    const controller = new OrderCollectionSourceController(source as never, {} as never);
    const response = { setHeader: vi.fn() };

    const raw = await controller.downloadSource(ARTIFACT, ORG, response as never);

    expect(raw).toBeDefined();
    expect(source.readSourceDownload).toHaveBeenCalledWith({
      organizationId: ORG,
      artifactId: ARTIFACT,
    });
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });

  it('regenerates a transient workbook from a complete retained source under the same fence', async () => {
    const conversion = {
      buffer: Buffer.from('converted'),
      fileName: 'icecream.xls',
      sourceRows: 2,
      productRows: 2,
      outputRows: 2,
      skippedRows: 0,
    };
    const source = {
      readAttemptControl: vi.fn().mockResolvedValue({
        attemptId: ATTEMPT,
        attemptToken: TOKEN,
        state: 'COMPLETE',
        artifactId: ARTIFACT,
        plan: { mallKey: 'icecream-mall', collectionDate: null },
      }),
      readSourceDownload: vi.fn().mockResolvedValue({
        bytes: Buffer.from(JSON.stringify({ headers: ['주문번호'], rows: [['A-1']] })),
        fileName: 'capture.json',
        contentType: 'application/json',
      }),
      recordCollectedRows: vi.fn().mockResolvedValue(undefined),
    };
    const service = {
      convertIcecreamMallOrderRows: vi.fn().mockReturnValue(conversion),
    };
    const controller = new OrderCollectionSourceController(source as never, service as never);
    const response = { setHeader: vi.fn() };

    const result = await controller.convertRetainedSource(
      ATTEMPT,
      TOKEN,
      ORG,
      response as never,
    );

    expect(result).toBeDefined();
    expect(service.convertIcecreamMallOrderRows).toHaveBeenCalledWith({
      headers: ['주문번호'],
      rows: [['A-1']],
    });
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Order-Collection-Artifact-Id',
      ARTIFACT,
    );
    // 이 수집이 몇 건을 실어 왔는지는 변환할 때야 안다. 여기서 적지 않으면 성공한 수집도
    // 건수 0 으로 남아 대시보드가 그만큼 모자라게 센다(사장님 2026-09-21).
    expect(source.recordCollectedRows).toHaveBeenCalledWith({
      organizationId: ORG,
      attemptId: ATTEMPT,
      rowCount: 2,
    });
  });

  it('returns only validated Icecream continuation metadata under the owner fence', async () => {
    const source = {
      readAttemptControl: vi.fn().mockResolvedValue({
        attemptId: ATTEMPT,
        attemptToken: TOKEN,
        state: 'COMPLETE',
        artifactId: ARTIFACT,
        plan: { mallKey: 'icecream-mall', collectionDate: '2026-09-10' },
      }),
      readSourceDownload: vi.fn().mockResolvedValue({
        bytes: Buffer.from(JSON.stringify({
          headers: ['주문번호', '배송번호', '배송순번'],
          rows: [['selected-1', 'delivery-1', '1']],
          originalRows: [
            ['seen-1', 'delivery-0', '1'],
            ['selected-1', 'delivery-1', '1'],
          ],
          selectedRows: [['selected-1', 'delivery-1', '1']],
          selectedRowKeys: ['selected-1\u001fdelivery-1\u001f1'],
          selectionMode: 'automatic',
          fileName: 'provider-private-name',
        })),
        fileName: 'capture.json',
        contentType: 'application/json',
      }),
    };
    const controller = new OrderCollectionSourceController(source as never, {} as never);

    await expect(controller.readContinuation(ORG, ATTEMPT, TOKEN)).resolves.toEqual({
      mallKey: 'icecream-mall',
      headers: ['주문번호', '배송번호', '배송순번'],
      originalRows: [
        ['seen-1', 'delivery-0', '1'],
        ['selected-1', 'delivery-1', '1'],
      ],
      selectedRows: [['selected-1', 'delivery-1', '1']],
      selectedRowKeys: ['selected-1\u001fdelivery-1\u001f1'],
      selectionMode: 'automatic',
      sourceRows: 1,
    });
    expect(source.readSourceDownload).toHaveBeenCalledWith({
      organizationId: ORG,
      artifactId: ARTIFACT,
    });
  });

  it('does not expose continuation metadata for another mall or a lost fence', async () => {
    const source = {
      readAttemptControl: vi.fn().mockResolvedValue({
        attemptId: ATTEMPT,
        attemptToken: TOKEN,
        state: 'COMPLETE',
        artifactId: ARTIFACT,
        plan: { mallKey: 'kidsnote', collectionDate: '2026-09-10' },
      }),
      readSourceDownload: vi.fn(),
    };
    const controller = new OrderCollectionSourceController(source as never, {} as never);

    await expect(controller.readContinuation(ORG, ATTEMPT, TOKEN))
      .rejects.toThrow('ORDER_COLLECTION_CONTINUATION_UNSUPPORTED');
    await expect(controller.readContinuation(
      ORG,
      ATTEMPT,
      '66666666-6666-4666-8666-666666666666',
    )).rejects.toThrow('ATTEMPT_FENCE_LOST');
    expect(source.readSourceDownload).not.toHaveBeenCalled();
  });

  it('does not read or convert retained source after the owner fence is lost', async () => {
    const source = {
      readAttemptControl: vi.fn().mockResolvedValue({
        attemptId: ATTEMPT,
        attemptToken: TOKEN,
        state: 'COMPLETE',
        artifactId: ARTIFACT,
        plan: { mallKey: 'kidsnote', collectionDate: null },
      }),
      readSourceDownload: vi.fn(),
    };
    const service = { convertKidsnoteOrders: vi.fn() };
    const controller = new OrderCollectionSourceController(source as never, service as never);

    await expect(controller.convertRetainedSource(
      ATTEMPT,
      '55555555-5555-4555-8555-555555555555',
      ORG,
      { setHeader: vi.fn() } as never,
    )).rejects.toThrow('ATTEMPT_FENCE_LOST');
    expect(source.readSourceDownload).not.toHaveBeenCalled();
    expect(service.convertKidsnoteOrders).not.toHaveBeenCalled();
  });

  it('reads one mall source with organization scope and answers the shared status shape without a token', async () => {
    const status = {
      mallKey: 'art09',
      channelAccountId: '66666666-6666-4666-8666-666666666666',
      running: {
        attemptId: ATTEMPT,
        collectionMode: 'browser',
        startedAt: '2026-09-15T00:00:00.000Z',
        expiresAt: '2026-09-15T00:30:00.000Z',
      },
      lastComplete: null,
      lastAttempt: {
        attemptId: ATTEMPT,
        state: 'RUNNING',
        errorCode: null,
        errorMessage: null,
        endedAt: null,
      },
    };
    const source = { readSourceStatus: vi.fn().mockResolvedValue(status) };
    const controller = new OrderCollectionSourceController(source as never, {} as never);

    const view = await controller.readSourceStatus('art09', ORG);

    expect(source.readSourceStatus).toHaveBeenCalledWith({ organizationId: ORG, mallKey: 'art09' });
    // strict 스키마라 attemptToken 같은 여분 키가 있으면 여기서 깨진다.
    expect(OrderCollectionSourceStatusSchema.parse(view)).toEqual(status);
  });

  /**
   * 주문 수집 화면은 몰 카드 20장을 한 번에 띄운다. 카드마다 한 번씩 읽으면 폴링만으로
   * 전역 throttler(60초 120회)를 넘겨 화면 전체가 429를 받는다(KID-170 D2).
   */
  it('answers every mall of the screen in one organization-scoped source list', async () => {
    const malls = [
      {
        mallKey: 'one-polaris',
        channelAccountId: null,
        running: null,
        lastComplete: null,
        lastAttempt: null,
      },
      {
        mallKey: 'art09',
        channelAccountId: '66666666-6666-4666-8666-666666666666',
        running: null,
        lastComplete: null,
        lastAttempt: {
          attemptId: ATTEMPT,
          state: 'COMPLETE',
          errorCode: null,
          errorMessage: null,
          endedAt: '2026-09-15T00:10:00.000Z',
        },
      },
    ];
    const source = { readSourceStatuses: vi.fn().mockResolvedValue(malls) };
    const controller = new OrderCollectionSourceController(source as never, {} as never);

    const view = await controller.readSourceStatuses(ORG);

    expect(source.readSourceStatuses).toHaveBeenCalledWith({ organizationId: ORG });
    // strict 스키마라 attemptToken 같은 여분 키가 있으면 여기서 깨진다.
    expect(view.malls.map((mall) => OrderCollectionSourceStatusSchema.parse(mall))).toEqual(malls);
  });

  it('refuses a mall source read with no mall key', async () => {
    const source = { readSourceStatus: vi.fn() };
    const controller = new OrderCollectionSourceController(source as never, {} as never);

    await expect(controller.readSourceStatus(undefined, ORG))
      .rejects.toThrow('INVALID_ORDER_COLLECTION_SCOPE');
    await expect(controller.readSourceStatus('   ', ORG))
      .rejects.toThrow('INVALID_ORDER_COLLECTION_SCOPE');
    expect(source.readSourceStatus).not.toHaveBeenCalled();
  });

  it('stops a running mall attempt with organization scope only, never the attempt token', async () => {
    const stopped = { attemptId: ATTEMPT, state: 'FAILED', errorCode: 'USER_CANCELLED' };
    const source = { cancelAttempt: vi.fn().mockResolvedValue(stopped) };
    const controller = new OrderCollectionSourceController(source as never, {} as never);

    await expect(controller.cancelAttempt(ATTEMPT, ORG)).resolves.toEqual(stopped);
    expect(source.cancelAttempt).toHaveBeenCalledWith({
      organizationId: ORG,
      attemptId: ATTEMPT,
    });
  });
});
