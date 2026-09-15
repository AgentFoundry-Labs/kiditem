import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MallOperationOutcomeController } from '../mall-operation-outcome.controller';

const ORG = '00000000-0000-4000-8000-000000000001';
const VALID = {
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
  mallKey: 'onch',
  operation: 'registration_fill',
  outcome: 'attention',
  itemCount: 3,
};

function setup() {
  const service = {
    record: vi.fn(async () => ({ id: 'row-1' })),
    summary: vi.fn(async () => ({ since: '', days: 7, total: 0, rows: [] })),
  };
  return { service, controller: new MallOperationOutcomeController(service as never) };
}

describe('MallOperationOutcomeController', () => {
  it('is served under /api/channels/mall-operation-outcomes', () => {
    expect(Reflect.getMetadata('path', MallOperationOutcomeController)).toBe('channels/mall-operation-outcomes');
  });

  it('records with the session organization and user, never from the body', async () => {
    const { service, controller } = setup();
    await controller.record(ORG, { id: 'user-1' } as never, VALID);
    expect(service.record).toHaveBeenCalledWith(ORG, 'user-1', expect.objectContaining({ mallKey: 'onch', itemCount: 3 }));
  });

  /** 본문은 strict 계약이다 — 조직을 바꾸려는 값이나 비밀번호가 섞이면 거절한다. */
  it('⭐ rejects unknown body fields such as organizationId or password', () => {
    const { service, controller } = setup();
    expect(() => controller.record(ORG, { id: 'u' } as never, { ...VALID, organizationId: 'other' })).toThrow(
      BadRequestException,
    );
    expect(() => controller.record(ORG, { id: 'u' } as never, { ...VALID, password: 'secret' })).toThrow(
      BadRequestException,
    );
    expect(service.record).not.toHaveBeenCalled();
  });

  it('rejects an outcome outside the vocabulary', () => {
    const { controller } = setup();
    expect(() => controller.record(ORG, { id: 'u' } as never, { ...VALID, outcome: 'published' })).toThrow(
      BadRequestException,
    );
  });

  /** 주문수집 · 셀피아 전송 · 송장 전송은 Orders 가 가진 사실이라 관찰 기록으로 받지 않는다. */
  it('⭐ rejects operations that Orders already owns', () => {
    const { service, controller } = setup();
    for (const operation of ['order_collection', 'sellpia_transfer', 'tracking_upload']) {
      expect(() => controller.record(ORG, { id: 'u' } as never, { ...VALID, operation })).toThrow(
        BadRequestException,
      );
    }
    expect(service.record).not.toHaveBeenCalled();
  });

  it('summary defaults to seven days', async () => {
    const { service, controller } = setup();
    await controller.summary(ORG, {});
    expect(service.summary).toHaveBeenCalledWith(ORG, 7);
  });
});
