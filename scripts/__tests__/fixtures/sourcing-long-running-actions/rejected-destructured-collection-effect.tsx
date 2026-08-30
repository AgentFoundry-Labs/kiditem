import { useEffect } from 'react';

export function RejectedDestructuredCollectionEffect() {
  const { start: startCollection } = useSourcingOperationAction();

  useEffect(() => {
    void startCollection();
  }, [startCollection]);

  return null;
}

declare function useSourcingOperationAction(): { start(): Promise<void> };
