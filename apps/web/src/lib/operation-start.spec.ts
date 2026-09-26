import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectExtensionId, sendToExtension } from './extension-bridge';
import { extensionAcceptsOperationLogin, requestOperationStart } from './operation-start';

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

  it('extensionAcceptsOperationLogin은 ping의 operationLoginV1을 본다', async () => {
    await expect(extensionAcceptsOperationLogin('ext-1')).resolves.toBe(true);
    vi.mocked(sendToExtension).mockResolvedValueOnce({ success: true, capabilities: { operationRuntime: true } });
    await expect(extensionAcceptsOperationLogin('ext-1')).resolves.toBe(false);
    vi.mocked(sendToExtension).mockRejectedValueOnce(new Error('gone'));
    await expect(extensionAcceptsOperationLogin('ext-1')).resolves.toBe(false);
  });
});
