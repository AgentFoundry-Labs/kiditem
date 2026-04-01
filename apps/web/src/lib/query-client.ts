import { QueryClient, QueryCache } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isApiError } from './api-error';

export function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        const message = isApiError(error) ? error.detail : '요청 처리 중 오류가 발생했습니다.';
        toast.error(message);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
