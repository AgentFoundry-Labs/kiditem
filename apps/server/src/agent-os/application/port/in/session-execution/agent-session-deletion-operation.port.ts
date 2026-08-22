import type {
  OperationHandlerContext,
  OperationHandlerResult,
} from '../../../../../common/operation-definition';

export const AGENT_SESSION_DELETION_OPERATION_PORT = Symbol(
  'AGENT_SESSION_DELETION_OPERATION_PORT',
);

/** The complete deletion use case exposed to the Operations incoming adapter. */
export interface AgentSessionDeletionOperationPort {
  execute(context: OperationHandlerContext): Promise<OperationHandlerResult>;
  exhaustRetry(
    context: OperationHandlerContext,
    failure: { code: string; message: string },
  ): Promise<void>;
  finalizeEphemeralSuccess(
    context: OperationHandlerContext,
    result: Record<string, unknown>,
  ): Promise<void>;
}
