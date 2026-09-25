import type {
  OperationBeginRequest,
  OperationBeginResponse,
  OperationCancelResponse,
  OperationChunkKind,
  OperationChunkPutRequest,
  OperationChunkPutResponse,
  OperationFinishRequest,
  OperationFinishResponse,
  OperationListQuery,
  OperationListResponse,
} from '@kiditem/shared/operation';

export const OPERATION_PORT = Symbol('OPERATION_PORT');

/** 실행 계약의 다섯 문(begin·chunk·finish·cancel·reader). 조직은 진입점이 정한다. */
export interface OperationPort {
  begin(organizationId: string, request: OperationBeginRequest): Promise<OperationBeginResponse>;
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
  cancel(organizationId: string, operationId: string): Promise<OperationCancelResponse>;
  list(organizationId: string, query: OperationListQuery): Promise<OperationListResponse>;
}
