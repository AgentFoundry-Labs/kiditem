import { QueryClient, QueryCache } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api-error';

/**
 * dev mode 에서 Next 가 페이지 chunk 를 컴파일하는 동안 fetch 가 abort 되거나
 * 일시적 network error 발생할 수 있음 — 사용자가 실제로 행동 안 한 transient
 * 에러는 toast 로 노이즈 띄우지 않음. 정상 ApiError(403/500 등) 는 그대로.
 */
function isTransientFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError') return true;
  // fetch 실패 (서버 미기동, network 차단, CORS preflight) — 메시지에만 단서
  if (error.message === 'Failed to fetch' || error.message === 'Load failed') return true;
  // Next dev 의 모듈 chunk 로딩 실패
  if (error.message.includes('Loading chunk') || error.message.includes('ChunkLoadError')) return true;
  return false;
}

/**
 * 401 `auth_required` 는 apiClient 가 이미 refresh/signOut 흐름을 단일 owner 로
 * 처리하고 AuthProvider 가 `/login` redirect 까지 담당한다. 토스트가 추가로
 * 뜨면 (1) 사용자에게 의미 없는 노이즈, (2) 로그인 페이지에 도착했을 때
 * `?reason=session_expired` 안내 토스트와 중복된다.
 */
function isHandledAuthRequiredError(error: unknown): boolean {
  return isApiError(error) && error.status === 401 && error.code === 'auth_required';
}

export function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (isTransientFetchError(error)) return;
        if (isHandledAuthRequiredError(error)) return;
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
