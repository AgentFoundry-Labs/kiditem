import { useEffect } from 'react';

export function AllowedReadEffect() {
  useEffect(() => {
    void refreshPersistedSnapshot();
  }, []);

  return null;
}

declare function refreshPersistedSnapshot(): Promise<void>;
