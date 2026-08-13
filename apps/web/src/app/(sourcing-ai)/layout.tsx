import { SourcingCacheBoundary } from './SourcingCacheBoundary';
import type { ReactNode } from 'react';

export default function SourcingAiLayout({ children }: { children: ReactNode }) {
  return <SourcingCacheBoundary>{children}</SourcingCacheBoundary>;
}
