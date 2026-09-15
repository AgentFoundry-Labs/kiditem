import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import {
  startCollectionSource,
  useCollectionSourceControl,
  type CollectionSourceAdapter,
  type CollectionStartOutcome,
} from './use-collection-source-control';

vi.mock('@/lib/browser-collection-session', () => ({
  sendBrowserCollectionControl: vi.fn().mockResolvedValue(undefined),
}));

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';

type Status = { running: string | null };

let status: Status;

function adapter(
  start: (input: void) => Promise<CollectionStartOutcome>,
): CollectionSourceAdapter<Status> {
  return {
    sourceKey: 'test.source',
    label: '테스트 수집',
    statusQuery: { queryKey: ['test', 'source'], queryFn: async () => status },
    readRunning: (current) =>
      current.running ? { attemptId: current.running, scopeLabel: null } : null,
    start,
    cancelOnServer: vi.fn().mockResolvedValue(undefined),
    readCompleteId: () => null,
    onNewComplete: () => undefined,
  };
}

function MountedControl({ source }: { source: CollectionSourceAdapter<Status> }) {
  const control = useCollectionSourceControl(source);
  return (
    <CollectionStartControl
      control={control}
      startLabel="수집"
      onStart={() => control.start()}
      onStop={control.stop}
    />
  );
}

function renderControl(source: CollectionSourceAdapter<Status>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MountedControl source={source} />
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  status = { running: null };
});

describe('startCollectionSource', () => {
  it('starts from outside a mounted control and hands the running state to every copy', async () => {
    const start = vi.fn(async (): Promise<CollectionStartOutcome> => {
      status = { running: ATTEMPT_ID };
      return { outcome: 'started', attemptId: ATTEMPT_ID };
    });
    const source = adapter(start);
    const client = renderControl(source);
    await screen.findByRole('button', { name: '수집' });

    const outcome = await startCollectionSource(client, source, undefined);

    expect(outcome).toEqual({ outcome: 'started', attemptId: ATTEMPT_ID });
    await waitFor(() => expect(screen.getByText('수집 중')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '수집 중단' })).toBeEnabled();
  });

  it('reads a start that is already in flight for the source as already running', async () => {
    let release: (() => void) | undefined;
    const start = vi.fn(async (): Promise<CollectionStartOutcome> => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { outcome: 'started', attemptId: ATTEMPT_ID };
    });
    const source = adapter(start);
    const client = renderControl(source);
    await screen.findByRole('button', { name: '수집' });

    const first = startCollectionSource(client, source, undefined);
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    const second = await startCollectionSource(client, source, undefined);

    expect(second).toEqual({ outcome: 'running', attemptId: null });
    expect(start).toHaveBeenCalledTimes(1);
    release?.();
    await first;
  });
});
