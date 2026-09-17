import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
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

function MountedControl<TStatus>({ source }: { source: CollectionSourceAdapter<TStatus> }) {
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

function renderControl<TStatus>(source: CollectionSourceAdapter<TStatus>) {
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

/**
 * 화면 하나가 여러 원천을 한 읽기로 받는 경우(몰 카드 20장). 옆 원천이 바뀔 때마다
 * 읽기 전체가 새 값으로 오므로, 읽기를 통째로 비교하면 이 원천의 시작 안내가 근거
 * 없이 사라진다(KID-170).
 */
describe('a status read several sources share', () => {
  type Slot = { key: string; running: string | null; lastAttempt: string | null };
  type SlotList = readonly Slot[];

  const LIST_KEY = ['test', 'shared-list'];
  const REFUSED = '설정이 필요합니다.';
  let slots: SlotList;

  function slot(key: string, patch: Partial<Slot> = {}): Slot {
    return { key, running: null, lastAttempt: null, ...patch };
  }

  function listAdapter(
    readStatusIdentity?: (status: SlotList) => unknown,
  ): CollectionSourceAdapter<SlotList> {
    return {
      sourceKey: 'test.shared-list',
      label: '목록 수집',
      statusQuery: { queryKey: LIST_KEY, queryFn: async () => slots },
      readRunning: (list) => {
        const mine = list.find((entry) => entry.key === 'mine');
        return mine?.running ? { attemptId: mine.running, scopeLabel: null } : null;
      },
      start: async () => ({ outcome: 'refused', message: REFUSED }),
      readCompleteId: () => null,
      onNewComplete: () => undefined,
      ...(readStatusIdentity ? { readStatusIdentity } : {}),
    };
  }

  const ownSlot = (list: SlotList) => list.find((entry) => entry.key === 'mine') ?? null;

  /** 새 읽기가 들어오고 그 알림이 화면까지 도달할 때까지. */
  async function reread(client: QueryClient) {
    await act(async () => {
      await client.refetchQueries({ queryKey: LIST_KEY, exact: true });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  beforeEach(() => {
    slots = [slot('mine'), slot('other')];
  });

  it('keeps this source`s refusal while another source in the same read changes', async () => {
    const source = listAdapter(ownSlot);
    const client = renderControl(source);
    await screen.findByRole('button', { name: '수집' });

    await startCollectionSource(client, source, undefined);
    expect(await screen.findByText(REFUSED)).toBeInTheDocument();

    // 옆 원천만 수집을 시작했다. 이 원천에 대해 알게 된 것은 없다.
    slots = [slots[0]!, slot('other', { running: ATTEMPT_ID })];
    await reread(client);
    expect(screen.getByText(REFUSED)).toBeInTheDocument();

    // 이 원천의 칸이 바뀌면 그 안내는 옛 상태에 대한 답이므로 물러난다.
    slots = [slot('mine', { lastAttempt: 'FAILED' }), slots[1]!];
    await reread(client);
    expect(screen.queryByText(REFUSED)).not.toBeInTheDocument();
  });

  /**
   * KID-161. 넘기기는 20초를 기다린다. 그 사이에 상태 읽기가 끝나 이 원천의 칸이 바뀌면,
   * 시작이 실패한 이유가 근거 없이 사라져 사장님은 왜 안 됐는지 못 본다.
   */
  it('⭐ keeps why the start failed even when this source`s status changes', async () => {
    const source = {
      ...listAdapter(ownSlot),
      start: async (): Promise<CollectionStartOutcome> => {
        throw new Error('확장 프로그램이 수집을 넘겨받지 않았습니다.');
      },
    };
    const client = renderControl(source);
    await screen.findByRole('button', { name: '수집' });

    await startCollectionSource(client, source, undefined).catch(() => undefined);
    expect(await screen.findByText('확장 프로그램이 수집을 넘겨받지 않았습니다.')).toBeInTheDocument();

    slots = [slot('mine', { lastAttempt: 'FAILED' }), slots[1]!];
    await reread(client);
    expect(screen.getByText('확장 프로그램이 수집을 넘겨받지 않았습니다.')).toBeInTheDocument();

    // 그 원천이 다시 수집 중이 되면 안내는 물러난다 — 늦게 넘겨받은 수집이 그렇다.
    slots = [slot('mine', { running: ATTEMPT_ID }), slots[1]!];
    await reread(client);
    await waitFor(() => expect(
      screen.queryByText('확장 프로그램이 수집을 넘겨받지 않았습니다.'),
    ).not.toBeInTheDocument());
  });

  it('retires the refusal on any change when the source names no identity', async () => {
    const source = listAdapter();
    const client = renderControl(source);
    await screen.findByRole('button', { name: '수집' });

    await startCollectionSource(client, source, undefined);
    expect(await screen.findByText(REFUSED)).toBeInTheDocument();

    slots = [slots[0]!, slot('other', { running: ATTEMPT_ID })];
    await reread(client);

    expect(screen.queryByText(REFUSED)).not.toBeInTheDocument();
  });
});
