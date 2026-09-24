import {
  admitSourceRecord,
  type SourceRecordAdmission,
} from '../../domain/source-record-admission';
import type { SalesProductDraftPort } from '../port/out/cross-domain/sales-product-draft.port';
import type { SourceRecordRepositoryPort } from '../port/out/repository/source-record.repository.port';

/**
 * 이미 수집한 원본이라 멈춘 수집의 종료 코드. 운영자의 원본 · 초안이 이미 있으니 원천 실패가 아니고,
 * `_CANCELLED` 로 끝나 원천 실패 알림을 만들지 않는다.
 */
export const ALREADY_COLLECTED_CODE = 'ALREADY_COLLECTED_CANCELLED';

export type SourceRecordRefusal = Extract<SourceRecordAdmission, { kind: 'refuse' }>;

/**
 * 같은 공급사 주소를 이미 수집했는가 — 수집을 시작하기 전에 화면에 알려 주는 자리(KID-313).
 *
 * 결정은 입장과 같은 규칙(`admitSourceRecord`)이 한다. 여기서 통과해도 입장이 식별자 잠금 안에서
 * 다시 판정한다 — 이 질문은 쓸데없는 수집을 막을 뿐 두 번 수집을 막는 자리가 아니다.
 */
export async function refusalForSourceUrl(
  records: Pick<SourceRecordRepositoryPort, 'findIdBySourceUrl'>,
  drafts: Pick<SalesProductDraftPort, 'findForSourceRecord'>,
  organizationId: string,
  sourceUrl: string,
): Promise<SourceRecordRefusal | null> {
  const sourceRecordId = await records.findIdBySourceUrl(organizationId, sourceUrl);
  if (!sourceRecordId) return null;
  const draft = await drafts.findForSourceRecord(organizationId, sourceRecordId);
  const admission = admitSourceRecord({
    sourceRecordId,
    salesProductId: draft?.salesProductId ?? null,
    salesProductStatus: draft?.status ?? null,
  });
  return admission.kind === 'refuse' ? admission : null;
}
