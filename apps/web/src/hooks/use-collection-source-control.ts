'use client';

import { useEffect, useRef, useState } from 'react';
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
import { queryKeys } from '@/lib/query-keys';

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

export type CollectionStopContext<TStatus> = Readonly<{
  /** The last status read this stop was decided against. */
  status: TStatus | undefined;
}>;

export type CollectionSourceAdapter<TStatus, TInput = void> = Readonly<{
  sourceKey: string;
  label: string;
  statusQuery: UseQueryOptions<TStatus, Error, TStatus, QueryKey>;
  readRunning: (status: TStatus) => CollectionRunning | null;
  /**
   * Starts the collection. A source whose screen starts it through its own
   * action has none; the control then shows only its running collection and stop.
   */
  start?: (input: TInput, context: CollectionStartContext<TStatus>) => Promise<CollectionStartOutcome>;
  /** The owner's operator stop. A source without one shows its running collection without a stop. */
  cancelOnServer?: (attemptId: string, context: CollectionStopContext<TStatus>) => Promise<unknown>;
  /**
   * Ends the extension's side of the running collection, releasing its tabs
   * and window. Defaults to the extension's session stop for the attempt; a
   * source whose extension run spans several attempts stops that run instead.
   */
  cancelInExtension?: (attemptId: string, context: CollectionStopContext<TStatus>) => Promise<unknown>;
  /**
   * A fingerprint of the running collection's progress, for a source whose
   * status shows it. A collection whose fingerprint has not changed for 90
   * seconds since the page first saw it gets the no-progress notice.
   */
  readProgress?: (status: TStatus) => string | null;
  /**
   * What this source's own part of the status read is, for a read that answers
   * several sources at once (the order screen's 20 mall cards share one list).
   * A start notice about the status it was decided against — a refusal, or a
   * collection already running — is retired when that part changes; without
   * this the whole read is compared and any other source's transition retires
   * it (KID-170). A start failure is not retired this way: it speaks about the
   * start, not about the status (KID-161).
   */
  readStatusIdentity?: (status: TStatus) => unknown;
  /** The latest complete collection's identity; a change while mounted is a newly finished collection. */
  readCompleteId: (status: TStatus) => string | null;
  /** Refreshes the reads a newly finished collection republished. */
  onNewComplete: (queryClient: QueryClient) => void;
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
  tone: 'refused' | 'error' | 'warning' | 'info';
  message: string;
}>;

export type CollectionControlView = Readonly<{
  state: CollectionControlState;
  statusRead: CollectionSourceStatusRead;
  running: CollectionRunning | null;
  /** Whether the running collection can be stopped from here: the owner has a stop and named the attempt. */
  canStop: boolean;
  /** False for a source whose screen starts it itself; the control then offers no start. */
  canStart?: boolean;
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
/** 같은 원천을 다시 시작했을 때의 안내. 컨트롤 밖에서 시작하는 화면도 같은 문장을 쓴다. */
export const COLLECTION_ALREADY_RUNNING_MESSAGE = '이미 진행 중인 수집이 있습니다.';
const HANGUL = /[가-힣]/;
// A session cancel answers within seconds; past this the owner route stops it.
const EXTENSION_STOP_DEADLINE_MS = 10_000;
/**
 * Every screen that shows a running collection reads its owner this often. A
 * source its own screen starts borrows this cadence while that start is in
 * flight, so the control learns the attempt before a short run is over.
 */
export const COLLECTION_RUNNING_POLL_MS = 2_000;
/**
 * Every mounted control re-reads its owner this often while nothing runs, so a
 * collection another tab or browser started shows up here too. Coming back to
 * the tab reads it right away (KID-186); this is the cadence while it is open.
 */
export const COLLECTION_IDLE_POLL_MS = 60_000;
// A real Wing traffic run uploads its first receipt 30 to 50 seconds in (KID-132).
const NO_PROGRESS_NOTICE_MS = 90_000;
const NO_PROGRESS =
  '확장에서 90초 넘게 진행 소식이 없습니다. 확장 상태를 확인하고, 멈췄다면 수집을 중단한 뒤 다시 시작해 주세요.';

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

async function runStart<TStatus, TInput>(
  queryClient: QueryClient,
  adapter: CollectionSourceAdapter<TStatus, TInput>,
  { input, statusAtStart }: StartVariables<TStatus, TInput>,
): Promise<CollectionStartOutcome> {
  if (!adapter.start) throw new Error(`${adapter.label} starts from its own screen action`);
  const outcome = await adapter.start(input, { status: statusAtStart });
  // Running state is the owner's to report; read it before settling.
  if (outcome.outcome !== 'refused') {
    await queryClient.invalidateQueries({ queryKey: adapter.statusQuery.queryKey, exact: true });
  }
  return outcome;
}

/**
 * Starts one source from outside a mounted control, for a screen that fans a
 * start out over sources no hook can loop over (the order screen collects
 * every mall at once). It runs through the source's own keyed start mutation,
 * so every mounted control of that source shows the same starting state and
 * outcome, and a source whose start is already in flight answers as running
 * instead of opening a second collection.
 */
export function startCollectionSource<TStatus, TInput>(
  queryClient: QueryClient,
  adapter: CollectionSourceAdapter<TStatus, TInput>,
  input: TInput,
): Promise<CollectionStartOutcome> {
  const mutationKey = queryKeys.collectionControl.mutation(adapter.sourceKey, 'start');
  if (queryClient.isMutating({ mutationKey }) > 0) {
    return Promise.resolve({ outcome: 'running', attemptId: null });
  }
  return queryClient
    .getMutationCache()
    .build<CollectionStartOutcome, Error, StartVariables<TStatus, TInput>, unknown>(queryClient, {
      mutationKey,
      mutationFn: (variables) => runStart(queryClient, adapter, variables),
    })
    .execute({
      input,
      statusAtStart: queryClient.getQueryData<TStatus>(adapter.statusQuery.queryKey),
    });
}

type StopVariables<TStatus> = Readonly<{
  attemptId: string;
  /** The status this stop was decided against. */
  statusAtStop: TStatus | undefined;
}>;

type StopState<TStatus> = MutationState<void, Error, StopVariables<TStatus>, unknown>;

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

type ProgressWatch = { attemptId: string; baseline: string; since: number; progressed: boolean };

// The first time any mounted control of a source saw a running attempt's
// progress, per query client, so every copy shows the notice at the same moment.
const progressWatches = new WeakMap<QueryClient, Map<string, ProgressWatch>>();

function watchProgress(
  queryClient: QueryClient,
  sourceKey: string,
  attemptId: string,
  progress: string,
): ProgressWatch {
  let watches = progressWatches.get(queryClient);
  if (!watches) {
    watches = new Map();
    progressWatches.set(queryClient, watches);
  }
  const current = watches.get(sourceKey);
  if (!current || current.attemptId !== attemptId) {
    const next = { attemptId, baseline: progress, since: Date.now(), progressed: false };
    watches.set(sourceKey, next);
    return next;
  }
  if (current.baseline !== progress) current.progressed = true;
  return current;
}

/** Whether a running attempt has shown no progress for 90 seconds since any control first saw it. */
function useNoProgress(
  queryClient: QueryClient,
  sourceKey: string,
  attemptId: string | null,
  progress: string | null,
): boolean {
  const [noProgress, setNoProgress] = useState(false);
  useEffect(() => {
    if (attemptId === null || progress === null) {
      setNoProgress(false);
      return undefined;
    }
    const watch = watchProgress(queryClient, sourceKey, attemptId, progress);
    if (watch.progressed) {
      setNoProgress(false);
      return undefined;
    }
    const remaining = watch.since + NO_PROGRESS_NOTICE_MS - Date.now();
    setNoProgress(remaining <= 0);
    if (remaining <= 0) return undefined;
    const timer = setTimeout(() => setNoProgress(true), remaining);
    return () => clearTimeout(timer);
  }, [queryClient, sourceKey, attemptId, progress]);
  return noProgress;
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
  identity: (status: TStatus | undefined) => unknown,
): CollectionControlNotice | null {
  if (!latest || latest.status === 'idle' || latest.status === 'pending') return null;
  // 시작이 왜 실패했는지는 상태에 대한 답이 아니라 이 시작에 일어난 일이다. 넘기기를 기다리는
  // 20초 사이에 상태 읽기가 끝났다는 이유로 지우면 사장님은 이유를 영영 못 본다(KID-161).
  // 그 원천이 수집 중이 되면 안내 자체가 그때 물러난다.
  if (latest.status === 'error') {
    return { tone: 'error', message: operatorMessage(latest.error, START_FAILED) };
  }
  if (identity(latest.variables?.statusAtStart) !== identity(status)) return null;
  if (latest.data?.outcome === 'refused') return { tone: 'refused', message: latest.data.message };
  if (latest.data?.outcome === 'running') {
    return { tone: 'info', message: COLLECTION_ALREADY_RUNNING_MESSAGE };
  }
  return null;
}

function stopNotice<TStatus>(
  latest: StopState<TStatus> | undefined,
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
  const query = useQuery({
    ...adapter.statusQuery,
    refetchInterval: (current) => {
      const data = current.state.data;
      if (current.state.status !== 'error' && data !== undefined && adapter.readRunning(data)) {
        return COLLECTION_RUNNING_POLL_MS;
      }
      const own = adapter.statusQuery.refetchInterval;
      return typeof own === 'function' ? own(current) : own;
    },
  });
  const statusQueryKey = adapter.statusQuery.queryKey;
  const startKey = queryKeys.collectionControl.mutation(adapter.sourceKey, 'start');

  const startMutation = useMutation({
    mutationKey: startKey,
    mutationFn: (variables: StartVariables<TStatus, TInput>) =>
      runStart(queryClient, adapter, variables),
  });
  const starting = useIsMutating({ mutationKey: startKey }) > 0;
  const latestStart = latestSubmitted(
    useMutationState({
      filters: { mutationKey: startKey },
      select: (mutation) => mutation.state as StartState<TStatus, TInput>,
    }),
  );

  const stopKey = queryKeys.collectionControl.mutation(adapter.sourceKey, 'stop');
  const stopMutation = useMutation({
    mutationKey: stopKey,
    mutationFn: async ({ attemptId, statusAtStop }: StopVariables<TStatus>) => {
      const context: CollectionStopContext<TStatus> = { status: statusAtStop };
      let extensionAnswered = false;
      try {
        await withDeadline(
          adapter.cancelInExtension
            ? adapter.cancelInExtension(attemptId, context)
            : sendBrowserCollectionControl(attemptId, 'cancelCollectionSession'),
          EXTENSION_STOP_DEADLINE_MS,
        );
        extensionAnswered = true;
      } catch {
        // No session for this attempt, a failed cancel, or no answer in time.
      }
      if (!extensionAnswered || (await attemptStillRunning(attemptId))) {
        await adapter.cancelOnServer?.(attemptId, context);
      }
      await queryClient.invalidateQueries({ queryKey: statusQueryKey, exact: true });
    },
  });
  const stopping = useIsMutating({ mutationKey: stopKey }) > 0;
  const latestStop = latestSubmitted(
    useMutationState({
      filters: { mutationKey: stopKey },
      select: (mutation) => mutation.state as StopState<TStatus>,
    }),
  );

  // An extension that answered without ending the attempt (none connected, or
  // a session in another browser) leaves the owner to stop it.
  async function attemptStillRunning(attemptId: string): Promise<boolean> {
    await queryClient.refetchQueries({ queryKey: statusQueryKey, exact: true });
    const status = queryClient.getQueryData<TStatus>(statusQueryKey);
    return status === undefined || adapter.readRunning(status)?.attemptId === attemptId;
  }

  const completeId = query.data === undefined ? undefined : adapter.readCompleteId(query.data);
  const observedCompleteId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (completeId === undefined) return;
    const previous = observedCompleteId.current;
    observedCompleteId.current = completeId;
    // The first read is the COMPLETE this mount already renders; only a later
    // one is a collection that finished while the page was open.
    if (previous === undefined || completeId === null || completeId === previous) return;
    adapter.onNewComplete(queryClient);
  }, [adapter, completeId, queryClient]);

  // 아직 아무것도 읽지 않은 상태는 그 자체가 신원이다.
  const statusIdentity = (status: TStatus | undefined): unknown =>
    status === undefined || !adapter.readStatusIdentity
      ? status
      : adapter.readStatusIdentity(status);

  const statusRead = collectionSourceStatusRead(query);
  const running = query.data === undefined ? null : adapter.readRunning(query.data);
  const canStop = Boolean(adapter.cancelOnServer) && running?.attemptId != null;
  const noProgress = useNoProgress(
    queryClient,
    adapter.sourceKey,
    running?.attemptId ?? null,
    running && adapter.readProgress && query.data !== undefined ? adapter.readProgress(query.data) : null,
  );
  const notice =
    starting || stopping
      ? null
      : running
        ? stopNotice(latestStop, running) ??
          (noProgress ? { tone: 'warning' as const, message: NO_PROGRESS } : null)
        : startNotice(latestStart, query.data, statusIdentity);
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
    if (!adapter.start || (state !== 'idle' && state !== 'refused')) return;
    // Another mounted control may have asked in this same moment; its
    // mutation is already pending in the shared cache before it re-renders.
    if (queryClient.isMutating({ mutationKey: startKey }) > 0) return;
    startMutation.mutate({ input, statusAtStart: query.data });
  };

  const stop = () => {
    const attemptId = running?.attemptId;
    if (!attemptId || !canStop || state !== 'running') return;
    if (queryClient.isMutating({ mutationKey: stopKey }) > 0) return;
    stopMutation.mutate({ attemptId, statusAtStop: query.data });
  };

  return {
    sourceKey: adapter.sourceKey,
    label: adapter.label,
    state,
    statusRead,
    running,
    canStop,
    canStart: Boolean(adapter.start),
    notice,
    query,
    status: query.data,
    start,
    stop,
  };
}
