'use client';

import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { shouldRenderQueryDevtools } from './query-devtools';
import { installQueryClientErrorHandler, makeQueryClient } from './query-client';
import { AuthProvider } from './AuthProvider';

const ReactQueryDevtools = dynamic(
  () => import('@tanstack/react-query-devtools').then(mod => mod.ReactQueryDevtools),
  { ssr: false },
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  const safeChildren = children as any;
  installQueryClientErrorHandler(queryClient);

  // AuthProvider 는 QueryProvider 내부에서 mount — useQueryClient() 가 의존.
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{safeChildren}</AuthProvider>
      {shouldRenderQueryDevtools() && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
