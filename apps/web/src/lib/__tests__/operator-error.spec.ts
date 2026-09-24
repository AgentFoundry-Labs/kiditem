import { describe, expect, it } from 'vitest';
import { ERROR_DEFINITIONS } from '@kiditem/shared/errors';
import { COLLECTION_STOPPED_MESSAGE } from '../collection-source-status-query';
import { attemptFailureText, operatorErrorText } from '../operator-error';

describe('attemptFailureText', () => {
  it('shows the registry sentence for a known code even when the stored message is English', () => {
    expect(attemptFailureText({ errorCode: 'ATTEMPT_EXPIRED', errorMessage: 'Order collection expired.' }))
      .toBe(ERROR_DEFINITIONS.ATTEMPT_EXPIRED.text);
  });

  it('reads extension spellings through the alias table', () => {
    expect(attemptFailureText({ errorCode: 'login_required', errorMessage: 'Sellpia login is required.' }))
      .toBe(ERROR_DEFINITIONS.MALL_LOGIN_REQUIRED.text);
  });

  it('gives an unknown code the source-level sentence, never the raw text', () => {
    const text = attemptFailureText({ errorCode: 'SELLPIA_SUPPLY_PRICE_MISSING', errorMessage: 'supply price missing for SKU-1' }, 'sellpia_product_profitability');
    expect(text).toBe('셀피아 수익성 수집 작업이 실패했습니다. 다시 시도해 주세요.');
  });

  it('says a stopped collection was stopped, and has nothing to say without a failure', () => {
    expect(attemptFailureText({ errorCode: 'COLLECTION_CANCELLED', errorMessage: null })).toBe(COLLECTION_STOPPED_MESSAGE);
    expect(attemptFailureText({ errorCode: null, errorMessage: null })).toBeNull();
    expect(attemptFailureText({ errorCode: null, errorMessage: '수집 중단: 로그인 필요' })).toBe('수집 중단: 로그인 필요');
    expect(attemptFailureText({ errorCode: null, errorMessage: 'provider failed' }, 'coupang_reviews'))
      .toBe('쿠팡 리뷰 수집 작업이 실패했습니다. 다시 시도해 주세요.');
    expect(attemptFailureText(null)).toBeNull();
  });

  it('keeps a Korean stored sentence when the code is unknown', () => {
    expect(attemptFailureText({ errorCode: 'ROCKET_PO_SOMETHING_NEW', errorMessage: '로켓 PO 근거가 부족합니다.' }))
      .toBe('로켓 PO 근거가 부족합니다.');
  });

  it('re-exports the shared operator sentence', () => {
    expect(operatorErrorText({ code: 'NOT_FOUND' })).toBe(ERROR_DEFINITIONS.NOT_FOUND.text);
  });
});
