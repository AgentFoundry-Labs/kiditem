import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { AdmittedSourceRecord } from './source-record.repository.port';
import type { AuthorizedCollectionOutput, SourcingCollectionPermit } from './sourcing-collection.repository.port';

export const SOURCING_OPERATION_LEDGER_REPOSITORY_PORT = Symbol('SOURCING_OPERATION_LEDGER_REPOSITORY_PORT');

export type SourcingSourceAccessFailure = 'SOURCE_NOT_ALLOWED' | 'SOURCE_DISABLED';

export interface SourcingOperationPublicationInput {
  sourceKey: string;
  scopeKey: string;
  targetKey: string;
  collectorKey: string;
  collectorVersion: string;
  plan: Record<string, unknown>;
  windowStartAt: Date | null;
  windowEndAt: Date | null;
  discoveredCount: number;
  acceptedCount: number;
  duplicateCount: number;
  contentChecksum: string;
  qualityReport: Record<string, unknown>;
  completedAt: Date;
}

/**
 * 실행 계약 finish 트랜잭션(KID-360) 안에서 Sourcing 원장을 쓰는 persistence 조합. 원장 사실과 발행 이력은
 * 이 한 트랜잭션에서 커밋된다 — 실행 행은 계약이, 원장은 이 포트가 쓴다. 실패는 실행 행에만 남는다(KID-355).
 */
export interface SourcingOperationLedgerRepositoryPort {
  /** 원천이 이 조직에 허용·켜짐인가(수집 설정). null이면 쓸 수 있다. */
  sourceAccessFailure(organizationId: string, sourceKey: string, transaction?: OwnerTransaction): Promise<SourcingSourceAccessFailure | null>;
  /** 관측·typed 원장·원본 기록(초안 포함)을 쓴다. 같은 원본의 두 번째 입장은 `SourceRecordDuplicateError`. */
  persistFacts(transaction: OwnerTransaction, permit: SourcingCollectionPermit, output: AuthorizedCollectionOutput, now: Date): Promise<{ duplicateCount: number; admitted: AdmittedSourceRecord[] }>;
  /** 이 실행이 쓴 Wing 카탈로그 사실 수(정규화 키워드별). 발행 receipt가 이 수와 같아야 리더가 읽는다. */
  countWingCatalogSnapshots(transaction: OwnerTransaction, organizationId: string, operationId: string): Promise<Map<string, number>>;
  /** 발행 1행을 쓰고 같은 대상의 이전 현재 발행을 내린다. */
  publish(transaction: OwnerTransaction, organizationId: string, operationId: string, publication: SourcingOperationPublicationInput): Promise<void>;
}
