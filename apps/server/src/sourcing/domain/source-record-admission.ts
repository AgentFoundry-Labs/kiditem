import type { SalesProductStatus } from '@kiditem/shared/sales-product';

/**
 * 원본 기록 입장 규칙 — 두 번 수집은 없다(KID-313).
 *
 * 같은 원본(플랫폼 + 원본 식별자)이 다시 들어오면 새 기록을 만들지 않고 거절하며, 이미 있는
 * 초안이나 판매 상품의 링크를 돌려준다. 초안을 지우면 원본 기록도 함께 지워지므로, 삭제 뒤의
 * 재수집은 새 수집이다. 보관한 판매 상품도 KID 를 지닌 채 남아 있으니 계속 거절한다.
 * DB 의 `(organization_id, source_platform, source_identity_hash)` 완전 유일키가 마지막 보루이고,
 * 이 규칙은 그 앞에서 운영자에게 어디로 가라고 말해 주는 자리다.
 */

export type ExistingSourceRecord = Readonly<{
  sourceRecordId: string;
  /** 이 기록을 가리키는 판매 상품. 없으면 삭제가 반쯤 끝난 고아 기록이다. */
  salesProductId: string | null;
  salesProductStatus: SalesProductStatus | null;
}>;

export type SourceRecordRefusal =
  | 'draft_exists'
  | 'selling_product_exists'
  | 'archived_product_exists'
  | 'orphan_record';

export type SourceRecordAdmission =
  | { kind: 'create' }
  | { kind: 'refuse'; reason: SourceRecordRefusal; existing: ExistingSourceRecord };

export function admitSourceRecord(existing: ExistingSourceRecord | null): SourceRecordAdmission {
  if (existing === null) return { kind: 'create' };
  if (existing.salesProductId === null || existing.salesProductStatus === null) {
    return { kind: 'refuse', reason: 'orphan_record', existing };
  }
  switch (existing.salesProductStatus) {
    case 'draft':
      return { kind: 'refuse', reason: 'draft_exists', existing };
    case 'active':
      return { kind: 'refuse', reason: 'selling_product_exists', existing };
    case 'archived':
      return { kind: 'refuse', reason: 'archived_product_exists', existing };
  }
}

/** 거절을 HTTP 409 로 옮길 때 쓰는 오류. `existing` 이 운영자가 갈 곳이다. */
export class SourceRecordDuplicateError extends Error {
  constructor(readonly refusal: Extract<SourceRecordAdmission, { kind: 'refuse' }>) {
    super(describeRefusal(refusal));
  }
}

export function describeRefusal(refusal: Extract<SourceRecordAdmission, { kind: 'refuse' }>): string {
  switch (refusal.reason) {
    case 'draft_exists':
      return '이미 수집한 상품입니다. 수집 상품에서 그 초안을 이어서 작업하세요.';
    case 'selling_product_exists':
      return '이미 판매 상품으로 만든 원본입니다. 등록 상품에서 그 상품을 여세요.';
    case 'archived_product_exists':
      return '보관한 판매 상품의 원본입니다. 다시 팔려면 보관을 풀지 않고 그 상품을 쓰세요.';
    case 'orphan_record':
      return '원본 기록이 남아 있지만 초안이 없습니다. 초안 삭제가 끝나지 않은 상태라 다시 시도하세요.';
  }
}
