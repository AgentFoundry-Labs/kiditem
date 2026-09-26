import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectExtensionId, sendToExtension } from './extension-bridge';
import { requestOperationStart } from './operation-start';

vi.mock('./extension-auth', () => ({ transferExtensionAuthTo: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./extension-bridge', () => ({ detectExtensionId: vi.fn(), sendToExtension: vi.fn() }));

const OPERATION_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(detectExtensionId).mockResolvedValue('ext-1');
  vi.mocked(sendToExtension).mockImplementation(async (_id, message) =>
    (message as { action: string }).action === 'ping'
      ? { success: true, capabilities: { operationRuntime: true } }
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
});
