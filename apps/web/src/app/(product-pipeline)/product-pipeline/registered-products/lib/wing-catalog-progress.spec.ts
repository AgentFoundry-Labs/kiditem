import { describe, expect, it } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import { describeWingCatalogOperation } from './wing-catalog-progress';

function operation(overrides: Partial<OperationView> & Pick<OperationView, 'kind'>): OperationView {
  return {
    id: '7a111111-1111-4111-8111-111111111111',
    status: 'executing',
    lockKeys: [],
    plan: {},
    progress: null,
    result: null,
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-09-25T00:00:00.000Z',
    finishedAt: null,
    expiresAt: '2099-01-01T00:00:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...overrides,
  };
}

describe('describeWingCatalogOperation — Wing 카탈로그 실행 하나의 운영자 문장', () => {
  it('목록 kind: 받는 중에는 받은 수 / 전체 수와 진행률, 끝나면 상세 대상 수 또는 변경 없음', () => {
    expect(describeWingCatalogOperation(operation({
      kind: 'channels.wing_catalog_list',
      progress: { listedProducts: 500, totalProducts: 1260, page: 1, totalPages: 3 },
    }))).toEqual({ phase: '상품 목록 받는 중', detail: '목록 500 / 1,260', percent: 40, tone: 'running' });
    expect(describeWingCatalogOperation(operation({
      kind: 'channels.wing_catalog_list',
      status: 'succeeded',
      result: { listedProductCount: 1260, detailTargetProductIds: ['a', 'b'], absentProductIds: ['c'], next: {} },
    }))).toMatchObject({ phase: '목록 반영 · 상세 2개 · 삭제 확인 1개 받을 차례', tone: 'running' });
    expect(describeWingCatalogOperation(operation({
      kind: 'channels.wing_catalog_list',
      status: 'succeeded',
      result: { listedProductCount: 1260, detailTargetProductIds: [], absentProductIds: [], next: null },
    }))).toMatchObject({ phase: '바뀐 상품 없음 · 상품 1,260개 최신', tone: 'done' });
  });

  it('상세 kind: 진행 중에는 상세·삭제 확인 수, 끝나면 반영한 수를 그대로 말한다(전체 완료라고 하지 않는다)', () => {
    expect(describeWingCatalogOperation(operation({
      kind: 'channels.wing_catalog_details',
      progress: { detailsDone: 3, detailTargets: 10, absentChecked: 0, absentTotal: 2 },
    }))).toEqual({ phase: '바뀐 상품 상세 받는 중', detail: '상세 3 / 10 · 삭제 확인 0 / 2', percent: 25, tone: 'running' });
    expect(describeWingCatalogOperation(operation({
      kind: 'channels.wing_catalog_details',
      status: 'succeeded',
      result: { detailTargets: 3, detailApplied: 1, detailUnchanged: 2, deletedProducts: 1, unconfirmedAbsentProductIds: ['x'] },
    }))).toEqual({
      phase: '상품 1개 상세 반영',
      detail: '같은 상세 2개 · 삭제 1개 · 삭제 미확인 1개',
      percent: 100,
      tone: 'done',
    });
  });

  it('엑셀 kind: Wing 생성 진행률과 반영 수', () => {
    expect(describeWingCatalogOperation(operation({
      kind: 'channels.wing_catalog_excel',
      progress: { status: 'CREATING', executeCount: 500, totalCount: 1260 },
    }))).toEqual({ phase: '쿠팡상품정보 엑셀 만드는 중', detail: '500 / 1,260', percent: 40, tone: 'running' });
    expect(describeWingCatalogOperation(operation({
      kind: 'channels.wing_catalog_excel',
      status: 'succeeded',
      result: { createdProductCount: 1, updatedProductCount: 9, createdSkuCount: 2, updatedSkuCount: 18, skippedRowCount: 0 },
    }))).toMatchObject({ phase: '쿠팡상품정보 반영 · 상품 10개 · 옵션 20개', tone: 'done' });
  });

  it('실패는 서버 문장을, 중단은 중단으로 말한다', () => {
    expect(describeWingCatalogOperation(operation({
      kind: 'channels.wing_catalog_list',
      status: 'failed',
      errorCode: 'CATALOG_LIST_INCOMPLETE',
      errorMessage: 'Wing 목록을 다 받지 못했습니다(3/4). 다시 동기화해 주세요.',
    }))).toEqual({ phase: '수집 실패', detail: 'Wing 목록을 다 받지 못했습니다(3/4). 다시 동기화해 주세요.', percent: null, tone: 'failed' });
    expect(describeWingCatalogOperation(operation({
      kind: 'channels.wing_catalog_details',
      status: 'failed',
      errorCode: 'SITE_LOGIN_REQUIRED',
      errorMessage: '쿠팡 윙 로그인이 필요합니다.',
    }))).toMatchObject({ detail: '쿠팡 윙 로그인이 필요합니다.' });
    expect(describeWingCatalogOperation(operation({ kind: 'channels.wing_catalog_details', status: 'cancelled', errorCode: 'OPERATION_CANCELLED' })))
      .toMatchObject({ phase: '수집 중단됨', tone: 'stopped' });
  });
});
