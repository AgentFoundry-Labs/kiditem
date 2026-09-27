import { describe, expect, it, vi } from 'vitest';
import { OrderCollectionSourceStatusSchema } from '@kiditem/shared/order-collection-source';
import { OrderCollectionSourceController } from './order-collection-source.controller';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = { id: '22222222-2222-4222-8222-222222222222' };
const ATTEMPT = '33333333-3333-4333-8333-333333333333';
const TOKEN = '44444444-4444-4444-8444-444444444444';
const OTHER = '55555555-5555-4555-8555-555555555555';

describe('OrderCollectionSourceController', () => {
  it('KID-379: 카카오의 브라우저 시작만 owner에 넘긴다 — 수집일·자동 선택 기준 그대로', async () => {
    const source = { beginAttempt: vi.fn().mockResolvedValue({ attemptId: ATTEMPT }) };
    const controller = new OrderCollectionSourceController(source as never, {} as never, {} as never);

    await controller.beginAttempt(
      {
        mallKey: 'kakao',
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
      mallKey: 'kakao',
      collectionDate: '2026-09-10',
      collectionMode: 'browser',
      selectionMode: 'automatic',
      seenRowKeys: ['A-1\u001f연필'],
    });
  });

  it('옛 시작은 실행 kind로 옮긴 몰·수동 업로드를 owner에 닿기 전에 거절한다(KID-380 T4)', () => {
    const source = { beginAttempt: vi.fn() };
    const controller = new OrderCollectionSourceController(source as never, {} as never, {} as never);
    expect(() => controller.beginAttempt({ mallKey: 'art09', collectionDate: '2026-09-10', collectionMode: 'browser' }, 'key', ORG, USER as never))
      .toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED', details: expect.objectContaining({ reason: 'mall_not_attempt_path' }) }));
    expect(() => controller.beginAttempt({ mallKey: 'kakao', collectionDate: null, collectionMode: 'manual-upload' }, 'key', ORG, USER as never))
      .toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'manual_upload_moved_to_operation' }) }));
    expect(source.beginAttempt).not.toHaveBeenCalled();
  });

  it('재변환은 실행 id로만 — 본문 operationId가 없으면 VALIDATION_FAILED(operation_id_required)', async () => {
    const mallOrders = { convertOperation: vi.fn() };
    const controller = new OrderCollectionSourceController({} as never, {} as never, mallOrders as never);
    await expect(controller.convertOperation(ATTEMPT, ORG, { setHeader: vi.fn() } as never, undefined))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'operation_id_required' } });
    expect(mallOrders.convertOperation).not.toHaveBeenCalled();
  });

  it('allows raw-only failure evidence for unsupported conversion', async () => {
    const source = { failAttempt: vi.fn().mockResolvedValue({ state: 'FAILED' }) };
    const controller = new OrderCollectionSourceController(source as never, {} as never, {} as never);

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

  it('continuation은 query operationId(경로와 같은 실행)로만 읽는다 — 없거나 다르면 VALIDATION_FAILED', async () => {
    const mallOrders = { readContinuation: vi.fn().mockResolvedValue({ mallKey: 'icecream-mall' }) };
    const controller = new OrderCollectionSourceController({} as never, {} as never, mallOrders as never);

    await expect(controller.readContinuation(ORG, ATTEMPT, ATTEMPT)).resolves.toEqual({ mallKey: 'icecream-mall' });
    expect(mallOrders.readContinuation).toHaveBeenCalledWith({ organizationId: ORG, operationId: ATTEMPT });
    await expect(controller.readContinuation(ORG, ATTEMPT, undefined)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'operation_id_required' } });
    await expect(controller.readContinuation(ORG, ATTEMPT, OTHER)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'operation_path_mismatch' } });
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
    const controller = new OrderCollectionSourceController(source as never, {} as never, {} as never);

    const view = await controller.readSourceStatuses(ORG);

    expect(source.readSourceStatuses).toHaveBeenCalledWith({ organizationId: ORG });
    // strict 스키마라 attemptToken 같은 여분 키가 있으면 여기서 깨진다.
    expect(view.malls.map((mall) => OrderCollectionSourceStatusSchema.parse(mall))).toEqual(malls);
  });

  it('stops a running mall attempt with organization scope only, never the attempt token', async () => {
    const stopped = { attemptId: ATTEMPT, state: 'FAILED', errorCode: 'USER_CANCELLED' };
    const source = { cancelAttempt: vi.fn().mockResolvedValue(stopped) };
    const controller = new OrderCollectionSourceController(source as never, {} as never, {} as never);

    await expect(controller.cancelAttempt(ATTEMPT, ORG)).resolves.toEqual(stopped);
    expect(source.cancelAttempt).toHaveBeenCalledWith({
      organizationId: ORG,
      attemptId: ATTEMPT,
    });
  });
});
