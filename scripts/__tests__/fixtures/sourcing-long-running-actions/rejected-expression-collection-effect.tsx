import { useEffect } from 'react';

export function RejectedExpressionCollectionEffect() {
  const operation = useSourcingOperationAction();

  useEffect(() => void operation.start(), [operation]);

  return null;
}

declare function useSourcingOperationAction(): { start(): Promise<void> };
