import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectExtensionId, sendToExtension } from './extension-bridge';
import { extensionAcceptsOperationLogin, OperationStartFailure, requestOperationStart } from './operation-start';

vi.mock('./extension-auth', () => ({ transferExtensionAuthTo: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./extension-bridge', () => ({ detectExtensionId: vi.fn(), sendToExtension: vi.fn() }));

const OPERATION_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(detectExtensionId).mockResolvedValue('ext-1');
  vi.mocked(sendToExtension).mockImplementation(async (_id, message) =>
    (message as { action: string }).action === 'ping'
      ? { success: true, capabilities: { operationRuntime: true, operationLoginV1: true } }
      : { success: true, operationId: OPERATION_ID, reused: false });
});

describe('requestOperationStart', () => {
  it('저장 자격은 확장 메시지에만 싣는다(KID-377) — 없으면 칸도 없다', async () => {
    const credentials = { loginId: 'fake-id', password: 'fake-password' };
    await expect(requestOperationStart('orders.coupang_shipment_summary', {}, { credentials })).resolves.toEqual({ outcome: 'started', operationId: OPERATION_ID });
    expect(sendToExtension).toHaveBeenLastCalledWith('ext-1', { action: 'operation.start', kind: 'orders.coupang_shipment_summary', scope: {}, credentials }, 60_000);

    await requestOperationStart('orders.coupang_shipment_summary', {});
    expect(sendToExtension).toHaveBeenLastCalledWith('ext-1', { action: 'operation.start', kind: 'orders.coupang_shipment_summary', scope: {} }, 60_000);
  });

  it('operationLoginV1을 싣지 않은 옛 확장에는 자격을 보내지 않는다 — 옛 빌드는 credentials 칸이 있는 시작을 거절한다(리뷰 S3)', async () => {
    vi.mocked(sendToExtension).mockImplementation(async (_id, message) =>
      (message as { action: string }).action === 'ping'
        ? { success: true, capabilities: { operationRuntime: true } }
        : { success: true, operationId: OPERATION_ID, reused: false });
    await requestOperationStart('orders.coupang_shipment_summary', {}, { credentials: { loginId: 'fake-id', password: 'fake-password' } });
    expect(sendToExtension).toHaveBeenLastCalledWith('ext-1', { action: 'operation.start', kind: 'orders.coupang_shipment_summary', scope: {} }, 60_000);
  });

  it('차단 때문에 자격을 싣지 않을 때 loginBlocked를 싣는다 — operationLoginBlockedV1을 싣는 빌드에만(실기기 R7)', async () => {
    vi.mocked(sendToExtension).mockImplementation(async (_id, message) =>
      (message as { action: string }).action === 'ping'
        ? { success: true, capabilities: { operationRuntime: true, operationLoginV1: true, operationLoginBlockedV1: true } }
        : { success: true, operationId: OPERATION_ID, reused: false });
    await requestOperationStart('orders.mall_orders', {}, { loginBlocked: true });
    expect(sendToExtension).toHaveBeenLastCalledWith('ext-1', { action: 'operation.start', kind: 'orders.mall_orders', scope: {}, loginBlocked: true }, 60_000);

    vi.mocked(sendToExtension).mockImplementation(async (_id, message) =>
      (message as { action: string }).action === 'ping'
        ? { success: true, capabilities: { operationRuntime: true, operationLoginV1: true } }
        : { success: true, operationId: OPERATION_ID, reused: false });
    await requestOperationStart('orders.mall_orders', {}, { loginBlocked: true });
    expect(sendToExtension).toHaveBeenLastCalledWith('ext-1', { action: 'operation.start', kind: 'orders.mall_orders', scope: {} }, 60_000);
  });

  it('표시를 여럿 요구하면 하나라도 없는 빌드에는 시작을 보내지 않는다(등록 kind + 몰 쓰기 사이트, KID-364)', async () => {
    vi.mocked(sendToExtension).mockImplementation(async (_id, message) =>
      (message as { action: string }).action === 'ping'
        ? { success: true, capabilities: { operationRuntime: true, channelsRegistrationOperationKindV1: true } }
        : { success: true, operationId: OPERATION_ID, reused: false });
    await expect(requestOperationStart('channels.registration', {}, {
      capability: ['channelsRegistrationOperationKindV1', 'mallWriteSite.art09'],
    })).rejects.toThrow('확장 프로그램을 업데이트해 주세요.');
    expect(sendToExtension).toHaveBeenCalledTimes(1);

    vi.mocked(sendToExtension).mockImplementation(async (_id, message) =>
      (message as { action: string }).action === 'ping'
        ? { success: true, capabilities: { operationRuntime: true, channelsRegistrationOperationKindV1: true, 'mallWriteSite.art09': true } }
        : { success: true, operationId: OPERATION_ID, reused: false });
    await expect(requestOperationStart('channels.registration', {}, {
      capability: ['channelsRegistrationOperationKindV1', 'mallWriteSite.art09'],
    })).resolves.toEqual({ outcome: 'started', operationId: OPERATION_ID });
  });

  it('서버가 시작을 거절하면 그 등록 코드를 실어 던진다(화면이 까닭을 코드로 가른다)', async () => {
    vi.mocked(sendToExtension).mockImplementation(async (_id, message) =>
      (message as { action: string }).action === 'ping'
        ? { success: true, capabilities: { operationRuntime: true } }
        : { success: false, errorCode: 'REGISTRATION_ALREADY_REGISTERED', error: '이미 이 몰 계정에 등록된 상품입니다.' });
    const started = requestOperationStart('channels.registration', {});
    await expect(started).rejects.toBeInstanceOf(OperationStartFailure);
    await expect(started).rejects.toMatchObject({ code: 'REGISTRATION_ALREADY_REGISTERED', message: '이미 이 몰 계정에 등록된 상품입니다.' });
  });

  it('extensionAcceptsOperationLogin은 ping의 operationLoginV1을 본다', async () => {
    await expect(extensionAcceptsOperationLogin('ext-1')).resolves.toBe(true);
    vi.mocked(sendToExtension).mockResolvedValueOnce({ success: true, capabilities: { operationRuntime: true } });
    await expect(extensionAcceptsOperationLogin('ext-1')).resolves.toBe(false);
    vi.mocked(sendToExtension).mockRejectedValueOnce(new Error('gone'));
    await expect(extensionAcceptsOperationLogin('ext-1')).resolves.toBe(false);
  });
  it('옛 빌드가 그 몰의 사이트 표시(mallOrderSite.<몰>)를 싣지 않으면 서버에 실행을 만들기 전에 업데이트 문장으로 거절한다(KID-380 T4)', async () => {
    vi.mocked(sendToExtension).mockImplementation(async (_id, message) =>
      (message as { action: string }).action === 'ping'
        ? { success: true, capabilities: { operationRuntime: true, orderCaptureOperationKindsV1: true, 'mallOrderSite.kidkids': true } }
        : { success: true, operationId: OPERATION_ID, reused: false });
    await expect(requestOperationStart('orders.mall_orders', { mallKey: 'lotte-on' }, { capability: 'mallOrderSite.lotte-on' }))
      .rejects.toThrow('확장 프로그램을 업데이트해 주세요.');
    expect(sendToExtension).not.toHaveBeenCalledWith('ext-1', expect.objectContaining({ action: 'operation.start' }), expect.anything());
    await expect(requestOperationStart('orders.mall_orders', { mallKey: 'kidkids' }, { capability: 'mallOrderSite.kidkids' }))
      .resolves.toEqual({ outcome: 'started', operationId: OPERATION_ID });
  });
});
