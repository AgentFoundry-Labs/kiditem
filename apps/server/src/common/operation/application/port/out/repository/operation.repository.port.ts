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
  lockKeys: string[];
}

export interface NewOperation {
  organizationId: string;
  kind: string;
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

/** 실행을 끝내는 쓰기. 같은 트랜잭션에서 청크를 지우고 잠금을 푼다. */
export interface OperationClosure {
  status: Exclude<OperationStatus, 'executing'>;
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
  transaction<T>(work: (tx: OperationTransaction) => Promise<T>): Promise<T>;
  /** 임대가 끝난 executing 실행을 `failed`(만료)로 닫고 청크·잠금을 지운다. 닫은 수. */
  expireDue(organizationId: string, kinds: readonly string[], now: Date, closure: OperationClosure): Promise<number>;
  list(organizationId: string, filter: OperationListFilter): Promise<OperationRecord[]>;
}
