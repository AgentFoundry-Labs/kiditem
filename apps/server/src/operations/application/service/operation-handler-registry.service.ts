import { Injectable } from '@nestjs/common';
import type {
  OperationDefinition,
  OperationHandler,
} from '../../../common/operation-definition';
import type { OperationHandlerRegistryPort } from '../port/in/operation-handler-registry.port';

interface RegisteredOperation {
  definition: OperationDefinition;
  handler: OperationHandler;
}

@Injectable()
export class OperationHandlerRegistryService
  implements OperationHandlerRegistryPort
{
  private readonly operations = new Map<string, RegisteredOperation>();

  register(definition: OperationDefinition, handler: OperationHandler): void {
    if (this.operations.has(definition.key)) {
      throw new Error(`duplicate operation key: ${definition.key}`);
    }
    this.operations.set(definition.key, { definition, handler });
  }

  getDefinition(operationKey: string): OperationDefinition {
    return this.get(operationKey).definition;
  }

  getHandler(operationKey: string): OperationHandler {
    return this.get(operationKey).handler;
  }

  parseInput(
    operationKey: string,
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    return this.getDefinition(operationKey).inputSchema.parse(input);
  }

  listDefinitions(): readonly OperationDefinition[] {
    return [...this.operations.values()]
      .map(({ definition }) => definition)
      .sort((left, right) => left.key.localeCompare(right.key));
  }

  private get(operationKey: string): RegisteredOperation {
    const operation = this.operations.get(operationKey);
    if (!operation) {
      throw new Error(`operation_not_registered: ${operationKey}`);
    }
    return operation;
  }
}
