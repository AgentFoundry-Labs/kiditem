'use client';

import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { shouldRenderQueryDevtools } from './query-devtools';
import { makeQueryClient } from './query-client';

const ReactQueryDevtools = dynamic(
  () => import('@tanstack/react-query-devtools').then(mod => mod.ReactQueryDevtools),
  { ssr: false },
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  const safeChildren = children as any;

  return (
    <QueryClientProvider client={queryClient}>
      {safeChildren}
      {shouldRenderQueryDevtools() && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
