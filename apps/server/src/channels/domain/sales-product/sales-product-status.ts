import type { SalesProductStatus } from '@kiditem/shared/sales-product';

/**
 * 판매 상품 상태 규칙 — 순수 함수만 둔다(KID-313).
 *
 * 상태는 `draft` · `active` · `archived` 셋이고 저장 열 하나다. 초안(`draft`)은 KID 가 없는 판매
 * 상품이고, KID 를 발급하는 순간 `active` 가 된다. 되돌아가는 길은 없다 — 판매를 접은 상품은
 * `archived` 로 보관하고, 초안은 보관하지 않고 지운다. 가격이 비었는지는 상태가 아니라 등록
 * 관문(`requireConfirmedPrice`)이 묻는다.
 */

export class SalesProductStatusError extends Error {}

/** `code IS NULL ⇔ status = 'draft'`. 저장 직전과 읽은 직후에 확인한다. */
export function assertStatusInvariant(product: {
  name: string;
  code: string | null;
  status: SalesProductStatus;
}): void {
  const isDraft = product.status === 'draft';
  const hasCode = product.code !== null;
  if (isDraft === hasCode) {
    throw new SalesProductStatusError(
      `'${product.name}' 의 상태(${product.status})와 판매상품코드(${product.code ?? '없음'})가 어긋납니다. 초안은 코드가 없고, 판매 상품은 코드가 있어야 합니다.`,
    );
  }
}

export function isDraft(status: SalesProductStatus): boolean {
  return status === 'draft';
}

/**
 * KID 를 발급한 뒤의 상태. 발급은 초안에서만 일어나고 그 결과는 언제나 `active` 다.
 * `active` 는 이미 코드가 있으니 재발급이 없고, `archived` 도 코드를 지닌 채 보관된 상품이라
 * 발급할 것이 없다.
 */
export function statusAfterKidIssued(product: { name: string; status: SalesProductStatus }): 'active' {
  if (product.status !== 'draft') {
    throw new SalesProductStatusError(
      `'${product.name}' 은(는) 이미 판매상품코드가 있는 상품(${product.status})이라 다시 발급하지 않습니다.`,
    );
  }
  return 'active';
}

/** 보관은 판매 상품에서만 한다. 초안은 보관 대신 지우고, 보관된 상품을 다시 보관하는 것은 변화가 없다. */
export function statusAfterArchive(product: { name: string; status: SalesProductStatus }): 'archived' {
  if (product.status === 'draft') {
    throw new SalesProductStatusError(
      `'${product.name}' 은(는) 아직 초안이라 보관할 수 없습니다. 쓰지 않을 초안은 삭제하세요.`,
    );
  }
  return 'archived';
}

export type DraftDeletionBlock = 'not_draft' | 'active_listing' | 'live_execution';

/**
 * 초안 삭제 가부. 초안만 지울 수 있고, 몰에 올라간 리스팅이나 끝나지 않은 실행이 딸려 있으면
 * 지우지 않는다(초안은 KID 가 없어 둘 다 없어야 정상이지만, 관문은 사실을 믿지 가정을 믿지
 * 않는다). 삭제는 원본 기록(SourceRecord)과 콘텐츠 워크스페이스를 같은 트랜잭션에서 함께 지운다.
 */
export function draftDeletion(input: {
  status: SalesProductStatus;
  /** KID 가 있으면 상태가 무엇이든 판매 상품이다 — 옛 행은 코드를 지닌 채 `draft` 로 남아 있을 수 있다. */
  hasCode: boolean;
  hasActiveListing: boolean;
  hasLiveExecution: boolean;
}): { allowed: true } | { allowed: false; reason: DraftDeletionBlock } {
  if (input.status !== 'draft' || input.hasCode) return { allowed: false, reason: 'not_draft' };
  if (input.hasActiveListing) return { allowed: false, reason: 'active_listing' };
  if (input.hasLiveExecution) return { allowed: false, reason: 'live_execution' };
  return { allowed: true };
}

/**
 * 새 등록 실행을 시작할 수 있는 상태. 초안은 KID 가 없어 몰에 보낼 수 없고, 보관한 상품은 새
 * 실행을 열지 않는다(이미 올라간 리스팅을 내리는 실행은 별도 결정이다).
 */
export function canStartRegistration(status: SalesProductStatus): boolean {
  return status === 'active';
}
