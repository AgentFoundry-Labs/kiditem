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

/** claim 결과. 워커가 조직을 가로질러 집으므로 집은 실행의 조직을 함께 준다(서버 내부, 와이어 아님). */
export type OperationClaimed = OperationClaimResult & { organizationId: string };

export interface OperationPrepareResult {
  operation: OperationView;
  /** 같은 idempotencyKey로 이미 만들어 둔 실행을 돌려줬다. */
  reused: boolean;
}

/**
 * 실행 계약의 문. HTTP 다섯 개(begin·chunk·finish·cancel·reader)와 서버 내부 둘(prepare·claim, KID-358).
 * 조직은 진입점이 정한다. claim은 워커가 조직을 가로질러 집는다.
 */
/** begin을 부른 사람. HTTP는 세션 사용자, 서버 내부 호출(엑셀 업로드 등)은 호출자가 넘긴다. */
export interface OperationActor {
  userId?: string | null;
}

export interface OperationPort {
  begin(organizationId: string, request: OperationBeginRequest, actor?: OperationActor): Promise<OperationBeginResponse>;
  /** owner가 자기 트랜잭션(`tx`) 안에서 만들어 두는 실행. 잠금은 여기서 잡혀 terminal까지 유지된다. */
  prepare(organizationId: string, request: OperationPrepareRequest, tx?: OwnerTransaction): Promise<OperationPrepareResult>;
  claim(request: OperationClaimRequest): Promise<OperationClaimed | null>;
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
  /** 실행 하나(서버 내부 reader). 임대가 끝났으면 먼저 만료 처분한다. 없거나 다른 조직이면 null. */
  get(organizationId: string, operationId: string): Promise<OperationView | null>;
  /** 이 lockKey를 지금 쥔(끝나지 않은) 실행. owner가 자기 원천의 살아 있는 실행을 찾아 취소할 때 쓴다. */
  findLive(organizationId: string, lockKey: string, tx?: OwnerTransaction): Promise<OperationView | null>;
}
