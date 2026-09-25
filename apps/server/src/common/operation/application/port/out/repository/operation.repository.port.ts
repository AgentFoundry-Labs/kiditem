import type {
  OperationStagedChunk,
  OperationStatus,
  OperationWindow,
} from '@kiditem/shared/operation';
import type { OwnerTransaction } from '../../../../../owner-transaction';
import type { JsonObject } from '../owner/operation-owner.port';

export const OPERATION_REPOSITORY = Symbol('OPERATION_REPOSITORY');

/** 저장된 실행 한 행과 지금 잡고 있는 lockKey. */
export interface OperationRecord {
  id: string;
  organizationId: string;
  kind: string;
  status: OperationStatus;
  token: string;
  expiresAt: Date;
  idempotencyKey: string | null;
  requestHash: string | null;
  fileHash: string | null;
  plan: JsonObject | null;
  progress: JsonObject | null;
  result: JsonObject | null;
  window: OperationWindow | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  /** claim 횟수(KID-358). begin으로 연 실행은 1. */
  attempts: number;
  maxAttempts: number;
  /** `prepared`가 claim될 수 있는 시각. null이면 바로. */
  scheduledFor: Date | null;
  lockKeys: string[];
}

export interface NewOperation {
  organizationId: string;
  kind: string;
  /** begin은 `executing`(attempts 1), prepare는 `prepared`(attempts 0). */
  status: 'executing' | 'prepared';
  attempts: number;
  maxAttempts: number;
  scheduledFor: Date | null;
  token: string;
  expiresAt: Date;
  idempotencyKey: string | null;
  requestHash: string;
  fileHash: string | null;
  plan: JsonObject;
  window: OperationWindow | null;
  lockKeys: string[];
  startedAt: Date;
}

/**
 * 실패한 시도를 같은 행의 `prepared`로 돌리는 쓰기(KID-358). 잠금은 유지하고 토큰은 바꿔 옛 워커를 끊는다.
 * `clearStaging`이면 청크와 progress를 지운다(finish(failed)); 임대 만료로 돌아올 때는 둘 다 남긴다.
 */
export interface OperationReschedule {
  scheduledFor: Date;
  token: string;
  errorCode: string | null;
  errorMessage: string | null;
  clearStaging: boolean;
}

/** claim이 집은 실행에 쓰는 값. */
export interface OperationClaimWrite {
  token: string;
  expiresAt: Date;
}

/** 실행을 끝내는 쓰기. 같은 트랜잭션에서 청크를 지우고 잠금을 푼다. */
export interface OperationClosure {
  status: Exclude<OperationStatus, 'executing' | 'prepared'>;
  errorCode: string | null;
  errorMessage: string | null;
  result?: JsonObject | null;
  window?: OperationWindow | null;
  finishedAt: Date;
}

export interface OperationTransaction {
  /** owner finalize에 넘기는 같은 트랜잭션 핸들. */
  readonly ownerTransaction: OwnerTransaction;
  /** 조직 fence를 건 행 잠금(FOR UPDATE) 읽기. */
  lockOperation(organizationId: string, operationId: string): Promise<OperationRecord | null>;
  findByIdempotencyKey(organizationId: string, kind: string, idempotencyKey: string): Promise<OperationRecord | null>;
  findByFileHash(organizationId: string, kind: string, fileHash: string): Promise<OperationRecord | null>;
  clearFileHash(organizationId: string, operationId: string): Promise<void>;
  /** 이 lockKey 중 하나라도 잡고 있는 실행들(행 잠금). */
  lockHolders(organizationId: string, lockKeys: readonly string[]): Promise<OperationRecord[]>;
  create(operation: NewOperation): Promise<OperationRecord>;
  /**
   * prepare용 생성. 잠금 행은 `ON CONFLICT DO NOTHING`으로 써서 다른 트랜잭션이 먼저 잡은 키가 있으면
   * (트랜잭션을 깨지 않고) null을 돌려준다. 호출자 트랜잭션(owner) 안에서 unique 위반으로 트랜잭션이
   * 중단되지 않게 하려는 것이다.
   */
  createHeld(operation: NewOperation): Promise<OperationRecord | null>;
  reschedule(organizationId: string, operationId: string, reschedule: OperationReschedule): Promise<OperationRecord>;
  /** claim 후보 하나를 `FOR UPDATE SKIP LOCKED`로 잠근다(조직 무관, 오래된 순). */
  lockNextClaimable(kinds: readonly string[], now: Date): Promise<OperationRecord | null>;
  markClaimed(organizationId: string, operationId: string, claim: OperationClaimWrite): Promise<OperationRecord>;
  /**
   * 시도가 남지 않은 채 임대가 끝난 executing 실행을 조직 무관하게 `FOR UPDATE SKIP LOCKED`로 잠근다
   * (claim이 terminal로 닫을 몫).
   */
  lockExhaustedExpired(filter: { kinds: readonly string[]; now: Date; limit: number }): Promise<OperationRecord[]>;
  close(organizationId: string, operationId: string, closure: OperationClosure): Promise<OperationRecord>;
  findChunkChecksum(operationId: string, chunkKind: string, sequence: number): Promise<string | null>;
  countChunks(operationId: string): Promise<number>;
  insertChunk(chunk: {
    operationId: string;
    organizationId: string;
    chunkKind: string;
    sequence: number;
    checksum: string;
    itemCount: number;
    payload: unknown[];
  }): Promise<void>;
  extendLease(organizationId: string, operationId: string, expiresAt: Date, progress?: JsonObject): Promise<void>;
  /** finalize에 넘길 청크. chunkKind, sequence 순. */
  stagedChunks(operationId: string): Promise<OperationStagedChunk[]>;
}

export interface OperationListFilter {
  kinds: string[];
  status?: OperationStatus;
  limit: number;
}

export interface OperationRepositoryPort {
  /** `ownerTransaction`을 받으면 새 트랜잭션을 열지 않고 그 안에서 돈다(prepare·cancel을 owner가 부를 때). */
  transaction<T>(work: (tx: OperationTransaction) => Promise<T>, ownerTransaction?: OwnerTransaction): Promise<T>;
  /** 잠금 없는 읽기(reader). */
  list(organizationId: string, filter: OperationListFilter): Promise<OperationRecord[]>;
  /** 잠금 없는 한 행 읽기(reader). */
  find(organizationId: string, operationId: string): Promise<OperationRecord | null>;
}
