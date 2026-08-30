import { useEffect } from 'react';

export function RejectedDestructuredExpressionCollectionEffect() {
  const { start } = useSourcingOperationAction();

  useEffect(() => start(), [start]);

  return null;
}

declare function useSourcingOperationAction(): { start(): Promise<void> };
