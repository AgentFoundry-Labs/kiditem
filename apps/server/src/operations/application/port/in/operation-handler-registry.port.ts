import type {
  OperationDefinition,
  OperationHandler,
} from '../../../../common/operation-definition';

export const OPERATION_HANDLER_REGISTRY_PORT = Symbol(
  'OPERATION_HANDLER_REGISTRY_PORT',
);

export type RegisteredOperationDefinition = Omit<
  OperationDefinition,
  'successPersistence'
> & {
  successPersistence: 'retained' | 'ephemeral_on_success';
};

export interface OperationHandlerRegistryPort {
  register(definition: OperationDefinition, handler: OperationHandler): void;
  getDefinition(operationKey: string): RegisteredOperationDefinition;
  getHandler(operationKey: string): OperationHandler;
  parseInput(
    operationKey: string,
    input: Record<string, unknown>,
  ): Record<string, unknown>;
  listDefinitions(): readonly RegisteredOperationDefinition[];
}
