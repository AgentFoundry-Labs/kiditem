import { useEffect } from 'react';

export function RejectedFunctionExpressionCollectionEffect() {
  const { start } = useSourcingOperationAction();

  useEffect(function collectOnMount() {
    void start();
  }, []);

  return null;
}

declare function useSourcingOperationAction(): { start(): Promise<void> };
