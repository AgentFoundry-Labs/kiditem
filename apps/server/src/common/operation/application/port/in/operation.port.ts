import type {
  OperationBeginRequest,
  OperationBeginResponse,
  OperationCancelResponse,
  OperationChunkKind,
  OperationChunkPutRequest,
  OperationChunkPutResponse,
  OperationClaimRequest,
  OperationClaimResult,
  OperationFinishRequest,
  OperationFinishResponse,
  OperationListQuery,
  OperationListResponse,
  OperationPrepareRequest,
  OperationView,
} from '@kiditem/shared/operation';
import type { OwnerTransaction } from '../../../../owner-transaction';

export const OPERATION_PORT = Symbol('OPERATION_PORT');

export interface OperationPrepareResult {
  operation: OperationView;
  /** 같은 idempotencyKey로 이미 만들어 둔 실행을 돌려줬다. */
  reused: boolean;
}

/**
 * 실행 계약의 문. HTTP 다섯 개(begin·chunk·finish·cancel·reader)와 서버 내부 둘(prepare·claim, KID-358).
 * 조직은 진입점이 정한다. claim은 워커가 조직을 가로질러 집는다.
 */
export interface OperationPort {
  begin(organizationId: string, request: OperationBeginRequest): Promise<OperationBeginResponse>;
  /** owner가 자기 트랜잭션(`tx`) 안에서 만들어 두는 실행. 잠금은 여기서 잡혀 terminal까지 유지된다. */
  prepare(organizationId: string, request: OperationPrepareRequest, tx?: OwnerTransaction): Promise<OperationPrepareResult>;
  claim(request: OperationClaimRequest): Promise<OperationClaimResult | null>;
  putChunk(input: {
    organizationId: string;
    operationId: string;
    token: string | undefined;
    chunkKind: OperationChunkKind;
    sequence: number;
    request: OperationChunkPutRequest;
  }): Promise<OperationChunkPutResponse>;
  finish(input: {
    organizationId: string;
    operationId: string;
    token: string | undefined;
    request: OperationFinishRequest;
  }): Promise<OperationFinishResponse>;
  /** `tx`를 주면 owner 트랜잭션 안에서 취소한다(생성 기록 취소와 함께). */
  cancel(organizationId: string, operationId: string, tx?: OwnerTransaction): Promise<OperationCancelResponse>;
  list(organizationId: string, query: OperationListQuery): Promise<OperationListResponse>;
}
