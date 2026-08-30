import { useEffect } from 'react';

export function RejectedIndirectDestructuredExpressionCollectionEffect() {
  const operation = useSourcingOperationAction();
  const { start } = operation;

  useEffect(() => start(), []);

  return null;
}

declare function useSourcingOperationAction(): { start(): Promise<void> };
