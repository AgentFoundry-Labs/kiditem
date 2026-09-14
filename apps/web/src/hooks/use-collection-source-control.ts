'use client';

import { useEffect, useRef } from 'react';
import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type MutationState,
  type QueryClient,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { sendBrowserCollectionControl } from '@/lib/browser-collection-session';
import {
  collectionSourceStatusRead,
  type CollectionSourceStatusRead,
} from '@/lib/collection-source-status-query';

/**
 * `attemptId` is null when the owner has not named the attempt yet, such as a
 * collection the extension opens after the start request is accepted.
 */
export type CollectionStartOutcome =
  | Readonly<{ outcome: 'started'; attemptId: string | null }>
  | Readonly<{ outcome: 'running'; attemptId: string | null }>
  | Readonly<{ outcome: 'refused'; message: string }>;

/** A running collection; `attemptId` is null when the owner reports it without naming the attempt. */
export type CollectionRunning = Readonly<{ attemptId: string | null; scopeLabel: string | null }>;

export type CollectionStartContext<TStatus> = Readonly<{
  /** The last status read this start was decided against. */
  status: TStatus | undefined;
}>;

export type CollectionSourceAdapter<TStatus, TInput = void> = Readonly<{
  sourceKey: string;
  label: string;
  statusQuery: UseQueryOptions<TStatus, Error, TStatus, QueryKey>;
  readRunning: (status: TStatus) => CollectionRunning | null;
  start: (input: TInput, context: CollectionStartContext<TStatus>) => Promise<CollectionStartOutcome>;
  /** The owner's operator stop. A source without one shows its running collection without a stop. */
  cancelOnServer?: (attemptId: string) => Promise<unknown>;
  readCompleteId?: (status: TStatus) => string | null;
  onNewComplete?: (queryClient: QueryClient) => void;
}>;

export type CollectionControlState =
  | 'loading'
  | 'unavailable'
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'refused';

export type CollectionControlNotice = Readonly<{
  tone: 'refused' | 'error' | 'info';
  message: string;
}>;

export type CollectionControlView = Readonly<{
  state: CollectionControlState;
  statusRead: CollectionSourceStatusRead;
  running: CollectionRunning | null;
  /** Whether the running collection can be stopped from here: the owner has a stop and named the attempt. */
  canStop: boolean;
  notice: CollectionControlNotice | null;
}>;

export type CollectionSourceControl<TStatus, TInput = void> = CollectionControlView &
  Readonly<{
    sourceKey: string;
    label: string;
    query: UseQueryResult<TStatus, Error>;
    status: TStatus | undefined;
    start: (input: TInput) => void;
    stop: () => void;
  }>;

const START_FAILED = '수집을 시작하지 못했습니다.';
const STOP_FAILED = '수집을 중단하지 못했습니다. 잠시 후 다시 시도해 주세요.';
const ALREADY_RUNNING = '이미 진행 중인 수집이 있습니다.';
const HANGUL = /[가-힣]/;
// A session cancel answers within seconds; past this the owner route stops it.
const EXTENSION_STOP_DEADLINE_MS = 10_000;

export function collectionControlMutationKey(sourceKey: string, action: 'start' | 'stop') {
  return ['collection-control', sourceKey, action] as const;
}

type StartVariables<TStatus, TInput> = Readonly<{
  input: TInput;
  /** The status this start was decided against; a later status retires its notice. */
  statusAtStart: TStatus | undefined;
}>;

type StartState<TStatus, TInput> = MutationState<
  CollectionStartOutcome,
  Error,
  StartVariables<TStatus, TInput>,
  unknown
>;

type StopVariables = Readonly<{ attemptId: string }>;

type StopState = MutationState<void, Error, StopVariables, unknown>;

function withDeadline<T>(operation: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('extension stop deadline passed')), ms);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function latestSubmitted<TState extends { submittedAt: number }>(
  states: readonly TState[],
): TState | undefined {
  return states.reduce<TState | undefined>(
    (latest, state) => (!latest || state.submittedAt >= latest.submittedAt ? state : latest),
    undefined,
  );
}

function operatorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : '';
  return HANGUL.test(message) ? message : fallback;
}

function startNotice<TStatus, TInput>(
  latest: StartState<TStatus, TInput> | undefined,
  status: TStatus | undefined,
): CollectionControlNotice | null {
  if (!latest || latest.status === 'idle' || latest.status === 'pending') return null;
  if (latest.variables?.statusAtStart !== status) return null;
  if (latest.status === 'error') {
    return { tone: 'error', message: operatorMessage(latest.error, START_FAILED) };
  }
  if (latest.data?.outcome === 'refused') return { tone: 'refused', message: latest.data.message };
  if (latest.data?.outcome === 'running') return { tone: 'info', message: ALREADY_RUNNING };
  return null;
}

function stopNotice(
  latest: StopState | undefined,
  running: CollectionRunning | null,
): CollectionControlNotice | null {
  if (!running || latest?.status !== 'error') return null;
  if (latest.variables?.attemptId !== running.attemptId) return null;
  return { tone: 'error', message: operatorMessage(latest.error, STOP_FAILED) };
}

export function useCollectionSourceControl<TStatus, TInput = void>(
  adapter: CollectionSourceAdapter<TStatus, TInput>,
): CollectionSourceControl<TStatus, TInput> {
  const queryClient = useQueryClient();
  const query = useQuery(adapter.statusQuery);
  const statusQueryKey = adapter.statusQuery.queryKey;
  const startKey = collectionControlMutationKey(adapter.sourceKey, 'start');

  const startMutation = useMutation({
    mutationKey: startKey,
    mutationFn: async ({ input, statusAtStart }: StartVariables<TStatus, TInput>) => {
      const outcome = await adapter.start(input, { status: statusAtStart });
      // Running state is the owner's to report; read it before settling.
      if (outcome.outcome !== 'refused') {
        await queryClient.invalidateQueries({ queryKey: statusQueryKey, exact: true });
      }
      return outcome;
    },
  });
  const starting = useIsMutating({ mutationKey: startKey }) > 0;
  const latestStart = latestSubmitted(
    useMutationState({
      filters: { mutationKey: startKey },
      select: (mutation) => mutation.state as StartState<TStatus, TInput>,
    }),
  );

  const stopKey = collectionControlMutationKey(adapter.sourceKey, 'stop');
  const stopMutation = useMutation({
    mutationKey: stopKey,
    mutationFn: async ({ attemptId }: StopVariables) => {
      let extensionAnswered = false;
      try {
        await withDeadline(
          sendBrowserCollectionControl(attemptId, 'cancelCollectionSession'),
          EXTENSION_STOP_DEADLINE_MS,
        );
        extensionAnswered = true;
      } catch {
        // No session for this attempt, a failed cancel, or no answer in time.
      }
      if (!extensionAnswered || (await attemptStillRunning(attemptId))) {
        await adapter.cancelOnServer?.(attemptId);
      }
      await queryClient.invalidateQueries({ queryKey: statusQueryKey, exact: true });
    },
  });
  const stopping = useIsMutating({ mutationKey: stopKey }) > 0;
  const latestStop = latestSubmitted(
    useMutationState({
      filters: { mutationKey: stopKey },
      select: (mutation) => mutation.state as StopState,
    }),
  );

  // An extension that answered without ending the attempt (none connected, or
  // a session in another browser) leaves the owner to stop it.
  async function attemptStillRunning(attemptId: string): Promise<boolean> {
    await queryClient.refetchQueries({ queryKey: statusQueryKey, exact: true });
    const status = queryClient.getQueryData<TStatus>(statusQueryKey);
    return status === undefined || adapter.readRunning(status)?.attemptId === attemptId;
  }

  const completeId =
    query.data === undefined || !adapter.readCompleteId
      ? undefined
      : adapter.readCompleteId(query.data);
  const observedCompleteId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (completeId === undefined) return;
    const previous = observedCompleteId.current;
    observedCompleteId.current = completeId;
    // The first read is the COMPLETE this mount already renders; only a later
    // one is a collection that finished while the page was open.
    if (previous === undefined || completeId === null || completeId === previous) return;
    adapter.onNewComplete?.(queryClient);
  }, [adapter, completeId, queryClient]);

  const statusRead = collectionSourceStatusRead(query);
  const running = query.data === undefined ? null : adapter.readRunning(query.data);
  const canStop = Boolean(adapter.cancelOnServer) && running?.attemptId != null;
  const notice =
    starting || stopping
      ? null
      : running
        ? stopNotice(latestStop, running)
        : startNotice(latestStart, query.data);
  const state: CollectionControlState =
    statusRead === 'loading'
      ? 'loading'
      : statusRead === 'unavailable'
        ? 'unavailable'
        : stopping
          ? 'stopping'
          : starting
            ? 'starting'
            : running
              ? 'running'
              : notice?.tone === 'refused'
                ? 'refused'
                : 'idle';

  const start = (input: TInput) => {
    if (state !== 'idle' && state !== 'refused') return;
    // Another mounted control may have asked in this same moment; its
    // mutation is already pending in the shared cache before it re-renders.
    if (queryClient.isMutating({ mutationKey: startKey }) > 0) return;
    startMutation.mutate({ input, statusAtStart: query.data });
  };

  const stop = () => {
    const attemptId = running?.attemptId;
    if (!attemptId || !canStop || state !== 'running') return;
    if (queryClient.isMutating({ mutationKey: stopKey }) > 0) return;
    stopMutation.mutate({ attemptId });
  };

  return {
    sourceKey: adapter.sourceKey,
    label: adapter.label,
    state,
    statusRead,
    running,
    canStop,
    notice,
    query,
    status: query.data,
    start,
    stop,
  };
}
