import { describe, expect, it } from 'vitest';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import {
  mallTrackingUploadResult,
  mallTrackingUploadRows,
  readMallTrackingOperatorConfirmation,
} from './mall-tracking-upload-operation';

const tracking = (ordNo: string, provider: string, invNo = `T-${ordNo}`) => ({ ordNo, itemNo: '1', invNo, courier: '1136', provider });
const plan = {
  channelAccountId: '22222222-2222-4222-8222-222222222222',
  mallKey: 'onch' as const,
  trackingOperationId: '33333333-3333-4333-8333-333333333333',
  rows: [
    { orderNo: 'A-1', trackingNumber: 'T-A-1', courier: '1136' },
    { orderNo: 'A-2', trackingNumber: 'T-A-2', courier: '1136' },
  ],
};
const results = (payload: unknown[]): OperationStagedChunk => ({ chunkKind: 'upload_results', sequence: 1, itemCount: payload.length, payload });

describe('몰 송장 업로드 실행 규칙(KID-355 wave8b)', () => {
  it('셀피아 송장 캡처에서 그 몰 판매처 행만 고르고(부분일치), 같은 주문·송장은 한 번', () => {
    const rows = mallTrackingUploadRows([
      tracking('A-1', '온채널(외부몰)'),
      tracking('A-1', '온채널(외부몰)'),
      tracking('B-1', '키드키즈'),
      tracking('A-2', '온채널'),
    ], 'onch');
    expect(rows).toEqual([
      { orderNo: 'A-1', trackingNumber: 'T-A-1', courier: '1136' },
      { orderNo: 'A-2', trackingNumber: 'T-A-2', courier: '1136' },
    ]);
  });

  it('그 몰 행이 없으면 시작하지 않는다', () => {
    expect(() => mallTrackingUploadRows([tracking('B-1', '키드키즈')], 'onch')).toThrow(expect.objectContaining({ code: 'ORDERS_TRACKING_UPLOAD_NO_ROWS' }));
  });

  it('행 상태를 합하고, 보고 없는 plan 행은 실패로 센다', () => {
    const result = mallTrackingUploadResult([results([
      { orderNo: 'A-1', status: 'already_uploaded', mallMessage: '이미 송장 등록됨' },
    ])], plan, null);
    expect(result).toEqual({
      uploaded: 0,
      alreadyUploaded: 1,
      notInList: 0,
      failed: 1,
      rows: [
        { orderNo: 'A-1', status: 'already_uploaded', mallMessage: '이미 송장 등록됨' },
        { orderNo: 'A-2', status: 'failed', mallMessage: null },
      ],
    });
  });

  it('plan 밖 주문의 결과는 거절한다', () => {
    expect(() => mallTrackingUploadResult([results([{ orderNo: 'Z-9', status: 'uploaded', mallMessage: null }])], plan, null))
      .toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  it('운영자 확인은 보고 없는 plan 행을 올라간 것으로 센다(키드키즈 제출만 확인)', () => {
    const confirmation = readMallTrackingOperatorConfirmation({ operatorConfirmation: {} });
    expect(confirmation).toEqual({});
    const result = mallTrackingUploadResult([results([{ orderNo: 'A-1', status: 'not_in_list', mallMessage: null }])], plan, confirmation);
    expect(result).toMatchObject({ uploaded: 1, notInList: 1, failed: 0 });
  });
});
