import { useEffect } from 'react';

export function AllowedExpressionReadEffect() {
  useEffect(() => void refreshPersistedSnapshot(), []);

  return null;
}

declare function refreshPersistedSnapshot(): Promise<void>;
