import { describe, expect, it, vi } from 'vitest';
import { OperationsController } from './operations.controller';

// 실행 하나 읽기(KID-359 리뷰 M1): 조직은 세션에서, 없거나 다른 조직의 실행은 OPERATION_NOT_FOUND.
const ORG = '22222222-2222-4222-8222-222222222222';
const OPERATION_ID = '11111111-1111-4111-8111-111111111111';

describe('OperationsController.get', () => {
  it('조직 범위로 실행 하나를 목록 항목과 같은 보기로 돌려준다', async () => {
    const view = { id: OPERATION_ID, kind: 'test.echo', status: 'succeeded' };
    const operations = { get: vi.fn().mockResolvedValue(view) };
    const controller = new OperationsController(operations as never);
    await expect(controller.get(ORG, OPERATION_ID)).resolves.toEqual({ operation: view });
    expect(operations.get).toHaveBeenCalledWith(ORG, OPERATION_ID);
  });

  it('없는 실행(다른 조직 포함)은 OPERATION_NOT_FOUND', async () => {
    const controller = new OperationsController({ get: vi.fn().mockResolvedValue(null) } as never);
    await expect(controller.get(ORG, OPERATION_ID)).rejects.toMatchObject({ code: 'OPERATION_NOT_FOUND' });
  });
});
