'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { NewConversationRequest } from '@/components/agent-interaction/conversation-surface-state';

interface RightSurfaceLauncherContextValue {
  openConversationFromLauncher(input: NewConversationRequest, launcher: HTMLElement): void;
}

const RightSurfaceLauncherContext = createContext<RightSurfaceLauncherContextValue | null>(null);

export function RightSurfaceLauncherProvider({
  children,
  openConversationFromLauncher,
}: RightSurfaceLauncherContextValue & { children: ReactNode }) {
  return (
    <RightSurfaceLauncherContext.Provider value={{ openConversationFromLauncher }}>
      {children}
    </RightSurfaceLauncherContext.Provider>
  );
}

export function useRightSurfaceLauncher(): RightSurfaceLauncherContextValue {
  const context = useContext(RightSurfaceLauncherContext);
  if (!context) throw new Error('right_surface_launcher_unavailable');
  return context;
}
