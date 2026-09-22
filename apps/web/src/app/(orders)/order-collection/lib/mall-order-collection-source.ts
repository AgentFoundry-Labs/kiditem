'use client';

import {
  OrderCollectionSourceStatusSchema,
  OrderCollectionTodayOrdersSchema,
  type OrderCollectionSourceStatus,
  type OrderCollectionTodayOrders,
} from '@kiditem/shared/order-collection-source';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { z } from 'zod';
import {
  COLLECTION_IDLE_POLL_MS,
  type CollectionStartOutcome,
} from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { sendBrowserCollectionControl } from '@/lib/browser-collection-session';
import { startWebOpenedCollection } from '@/lib/collection-start';
import { queryKeys } from '@/lib/query-keys';
import {
  detectOrderCollectionSessionExtensionStatus,
  orderCollectionExtensionUnavailableMessage,
} from './order-collection-extension';
import { todayYmd } from './order-collection-page-model';
import type { OrderCollectionSourceAdapter } from './order-collection-source-adapter';
import {
  beginOrderCollectionSourceAttempt,
  ORDER_COLLECTION_SOURCE_PATH,
  readActiveOrderCollectionAttempt,
  rememberActiveOrderCollectionAttempt,
  type ActiveOrderCollectionAttempt,
  type OrderCollectionSourceAttemptControl,
} from './order-collection-source-owner';
import type { OrderCollectionMallAccount } from '@/lib/order-mall-account-api';


export type OrderCollectionMode = 'browser' | 'manual-upload';

/** What one start collects; the owner keeps it on the attempt's plan. */
export type MallOrderCollectionStartInput = Readonly<{
  collectionDate?: string;
  selectionMode?: 'manual' | 'automatic';
  seenRowKeys?: readonly string[];
}>;

/**
 * The opened attempt as the mall's extension procedure receives it: the fence
 * token the conversion endpoints carry travels with it, and never through the
 * source status read.
 */
export type MallOrderCollectionHandoff = Readonly<{
  extensionId: string;
  attempt: OrderCollectionSourceAttemptControl;
  input: MallOrderCollectionStartInput;
}>;

/** 화면이 띄우는 몰 전체의 현재 상태. 카드마다 자기 몰 칸을 골라 읽는다. */
export type MallOrderCollectionSourceList = readonly OrderCollectionSourceStatus[];

const MallOrderCollectionSourceListSchema = z.object({
  malls: z.array(OrderCollectionSourceStatusSchema),
}).strict();

/**
 * 몰 카드 20장이 각자 자기 몰을 물으면 폴링만으로 전역 throttler(60초 120회)를 넘겨
 * 화면 전체가 429를 받는다. 화면 하나가 이 목록 한 번으로 20칸을 모두 읽는다
 * (KID-170 D2).
 */
export function readMallOrderCollectionSources(): Promise<MallOrderCollectionSourceList> {
  return apiClient
    .getParsed(`${ORDER_COLLECTION_SOURCE_PATH}/sources`, MallOrderCollectionSourceListSchema)
    .then((body) => body.malls);
}

/**
 * 오늘 수집이 실어 온 주문 수(서버 기록). 브라우저에 남은 변환 파일이 아니라 서버가 적은
 * 수라서, 어느 PC 에서 열어도 같고 대시보드의 '오늘 주문' 과 같은 수다(사장님 2026-09-22).
 */
export function readOrderCollectionTodayOrders(): Promise<OrderCollectionTodayOrders> {
  return apiClient.getParsed(
    `${ORDER_COLLECTION_SOURCE_PATH}/today-orders`,
    OrderCollectionTodayOrdersSchema,
  );
}

/** 화면 하나가 함께 보는 몰 목록 읽기의 키. 조직이 없으면 그 읽기는 꺼져 있다. */
function sourcesQueryKey(organizationId: string | null): QueryKey {
  return queryKeys.orders.collectionSources(organizationId ?? '');
}

/**
 * 몰 설정 저장이 낡게 만드는 읽기. 저장은 이 몰의 ChannelAccount 행을 만들어 목록의
 * 이 칸을 channelAccountId: null 에서 id 로 바꾸는데, 캐시가 그대로면 60초 유휴 폴링이
 * 돌 때까지 카드가 방금 저장한 운영자의 시작을 계속 거절한다(KID-170).
 */
export function invalidateMallOrderCollectionSources(
  queryClient: QueryClient,
  organizationId: string | null,
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: sourcesQueryKey(organizationId),
    exact: true,
  });
}

/** 이 몰의 칸. owner 가 아직 그 몰을 답하지 않은 목록이면 없다. */
export function findMallSource(
  sources: MallOrderCollectionSourceList,
  mallKey: string,
): OrderCollectionSourceStatus | null {
  return sources.find((source) => source.mallKey === mallKey) ?? null;
}

/**
 * 이 조직에 이 몰의 계정 행(ADR-0012)이 없어 아직 수집할 수 없다. 상태를 읽지
 * 못한 것도, 수집이 실패한 것도 아니므로 운영자에게 다음 할 일을 말한다(KID-170 D1).
 */
const NOT_CONFIGURED = {
  outcome: 'refused',
  message: '설정에서 사용을 켜고 저장한 뒤 수집할 수 있습니다.',
} as const;

/** 설정되지 않은 몰이라 거절된 시작인가. 전체 수집은 이것을 실패와 따로 센다. */
export function refusedAsNotConfigured(outcome: CollectionStartOutcome): boolean {
  return outcome.outcome === 'refused' && outcome.message === NOT_CONFIGURED.message;
}

/** owner 가 이 조직에서 모르는 몰이라고 답했다. begin 이 404 를 내는 유일한 이유다. */
function mallNotSetUp(error: unknown): boolean {
  return isApiError(error)
    && error.status === 404
    && error.detail === 'ORDER_COLLECTION_MALL_NOT_FOUND';
}

/** The owner's operator stop. Organization-scoped, so any tab can end the attempt. */
export function cancelMallOrderCollectionAttempt(attemptId: string) {
  return apiClient.post(
    `${ORDER_COLLECTION_SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}/cancel`,
  );
}

type MallBeginRequest = Readonly<{
  mallKey: string;
  collectionDate: string | null;
  collectionMode: OrderCollectionMode;
  selectionMode?: 'manual' | 'automatic';
  seenRowKeys?: string[];
}>;

/**
 * The owner replays an admission key only for the same request; a key sent with
 * anything else is refused as reused. A start that asks for something new
 * therefore drops the unanswered key instead of replaying it. This compares
 * every field the owner's request fingerprint carries: the per-mall storage key
 * already stands for the mall and its channel account.
 */
function sameBeginRequest(
  remembered: ActiveOrderCollectionAttempt,
  request: MallBeginRequest,
): boolean {
  return (remembered.collectionDate ?? null) === request.collectionDate
    && (remembered.collectionMode ?? null) === request.collectionMode
    && (remembered.selectionMode ?? null) === (request.selectionMode ?? null)
    && (remembered.seenRowKeys ?? []).join('\u0000') === (request.seenRowKeys ?? []).join('\u0000');
}

/**
 * Statuses the owner answers without having decided this begin. The start may
 * still have opened an attempt, so its key stays for the next start to replay,
 * as it does when the answer never arrived. Any other 4xx is a decision, and a
 * decided key has nothing left to replay.
 */
const UNDECIDED_BEGIN_STATUSES: readonly number[] = [408, 425, 429];

function ownerDecidedBegin(error: unknown): boolean {
  return isApiError(error)
    && error.status >= 400
    && error.status < 500
    && !UNDECIDED_BEGIN_STATUSES.includes(error.status);
}

/**
 * Sends one begin under `idempotencyKey`, having written the key and its request
 * down first, so an answer this browser never sees still leaves the key for the
 * next start (KID-189).
 */
async function openMallAttempt(
  organizationId: string | null,
  idempotencyKey: string,
  request: MallBeginRequest,
): Promise<OrderCollectionSourceAttemptControl> {
  if (organizationId) {
    rememberActiveOrderCollectionAttempt(organizationId, {
      attemptId: null,
      idempotencyKey,
      mallKey: request.mallKey,
      collectionDate: request.collectionDate,
      collectionMode: request.collectionMode,
      ...(request.selectionMode ? { selectionMode: request.selectionMode } : {}),
      ...(request.seenRowKeys ? { seenRowKeys: request.seenRowKeys } : {}),
    }, undefined, request.mallKey);
  }
  try {
    return await beginOrderCollectionSourceAttempt(idempotencyKey, request);
  } catch (error) {
    // owner 가 거절로 답한 키는 다시 보낼 이유가 없다. 결정에 이르지 못한
    // 답(네트워크·타임아웃·408·425·429)일 때만 남겨 다음 시작이 replay 한다.
    if (organizationId && ownerDecidedBegin(error)) {
      rememberActiveOrderCollectionAttempt(organizationId, {
        attemptId: null,
        idempotencyKey: null,
        mallKey: request.mallKey,
      }, undefined, request.mallKey);
    }
    throw error;
  }
}

async function detectMallCollectionExtension(): Promise<string> {
  const status = await detectOrderCollectionSessionExtensionStatus();
  if (status.status !== 'ready') {
    throw new Error(orderCollectionExtensionUnavailableMessage(status));
  }
  return status.extensionId;
}

/**
 * One mall's order collection for the shared control. The page opens the owner
 * attempt and hands it to the extension procedure this mall needs; the owner's
 * organization-scoped status read is what every browser sees as running, so a
 * second tab shows and stops the same collection.
 *
 * The browser-local attempt memory stays a resume hint for the reloaded screen
 * only. It names the attempt the owner admitted, and before that the admission
 * key this browser sent, so a begin whose answer was lost is replayed instead
 * of leaving a RUNNING attempt the extension never received. It is never read
 * to decide whether the mall is collecting.
 */
export function mallOrderCollectionSource({
  organizationId,
  account,
  collectionMode = 'browser',
  handOff,
  abortLocalRun,
}: Readonly<{
  organizationId: string | null;
  account: OrderCollectionMallAccount;
  collectionMode?: OrderCollectionMode;
  /** The mall's own extension hand-off, which runs its collection to the end. */
  handOff: (handoff: MallOrderCollectionHandoff) => Promise<void>;
  /** Ends this browser's procedure for the attempt the operator is stopping. */
  abortLocalRun?: (attemptId: string) => void;
}>): OrderCollectionSourceAdapter<MallOrderCollectionSourceList> {
  return {
    sourceKey: `orders.mall:${account.key}`,
    label: `${account.name} 주문 수집`,
    // 몰 카드는 누르면 바로 수집한다 — 무엇을 수집할지 먼저 고르는 화면이 없고, 이 원천만의
    // 시작 불가 사유도 없다(설정되지 않은 몰은 owner 가 시작을 거절하며 안내한다).
    card: { opensChooser: false, startBlockedReason: null },
    statusQuery: collectionSourceStatusQueryOptions<
      MallOrderCollectionSourceList,
      Error,
      MallOrderCollectionSourceList,
      QueryKey
    >({
      queryKey: sourcesQueryKey(organizationId),
      queryFn: readMallOrderCollectionSources,
      enabled: Boolean(organizationId),
      refetchInterval: COLLECTION_IDLE_POLL_MS,
      refetchIntervalInBackground: false,
      meta: { suppressGlobalErrorToast: true },
    }),
    readRunning: (sources) => {
      const running = findMallSource(sources, account.key)?.running;
      return running ? { attemptId: running.attemptId, scopeLabel: account.name } : null;
    },
    // 화면 하나가 몰 20칸을 한 읽기로 받는다. 전체 수집이 도는 동안 옆 몰이 시작·중단할
    // 때마다 목록 전체가 새로 오므로, 이 카드의 안내는 자기 칸이 바뀔 때만 물러난다.
    readStatusIdentity: (sources) => findMallSource(sources, account.key),
    start: (input, { status }) => {
      // 이 조직에 이 몰의 계정 행이 없으면 owner 는 시작을 받지 못한다. 상태를 읽지
      // 못한 것이 아니라 아직 설정되지 않은 것이므로, 아무도 부르지 않고 무엇을 하면
      // 되는지만 말한다(KID-170 D1).
      if (status && findMallSource(status, account.key)?.channelAccountId === null) {
        return Promise.resolve(NOT_CONFIGURED);
      }
      let opened: OrderCollectionSourceAttemptControl | null = null;
      return startWebOpenedCollection({
        detectExtension: detectMallCollectionExtension,
        begin: async (idempotencyKey) => {
          const request: MallBeginRequest = {
            mallKey: account.key,
            collectionDate: collectionMode === 'browser'
              ? input.collectionDate ?? todayYmd()
              : null,
            collectionMode,
            ...(collectionMode === 'browser'
              ? { selectionMode: input.selectionMode ?? 'manual' }
              : {}),
            ...(input.seenRowKeys ? { seenRowKeys: [...input.seenRowKeys] } : {}),
          };
          // 앞선 시작이 begin 의 답을 못 받았으면 그 키와 요청을 그대로 다시 보낸다.
          // begin 은 키로 멱등이라 owner 가 같은 시도를 돌려주고, 확장이 받지 못했던
          // 그 시도를 이 시작이 이어받는다(KID-189).
          const unanswered = organizationId
            ? readActiveOrderCollectionAttempt(organizationId, undefined, account.key)
            : null;
          const replayKey = unanswered?.attemptId === null
            && unanswered.idempotencyKey
            && sameBeginRequest(unanswered, request)
            ? unanswered.idempotencyKey
            : null;
          let beginKey = replayKey ?? idempotencyKey;
          let started: OrderCollectionSourceAttemptControl;
          try {
            started = await openMallAttempt(organizationId, beginKey, request);
            if (replayKey && started.state !== 'RUNNING') {
              // 재생한 키의 시도는 이미 끝났다(다른 탭의 중단, 임대 만료). 이어받을
              // 것이 없으므로 그 키를 버리고 새 키로 다시 열어야 핸드오프가 일어난다.
              beginKey = idempotencyKey;
              started = await openMallAttempt(organizationId, beginKey, request);
            }
          } catch (error) {
            // 마운트된 카드 밖에서 시작하면(전체 수집) 목록을 아직 읽지 않았을 수 있다.
            // 그때는 owner 가 모르는 몰이라고 답하며, 그것도 같은 설정 안내다.
            if (!mallNotSetUp(error)) throw error;
            return NOT_CONFIGURED;
          }
          opened = started;
          if (organizationId) {
            const hint = {
              attemptId: started.attemptId,
              idempotencyKey: beginKey,
              mallKey: account.key,
            };
            rememberActiveOrderCollectionAttempt(organizationId, hint);
            rememberActiveOrderCollectionAttempt(organizationId, hint, undefined, account.key);
          }
          return {
            outcome: 'opened',
            attemptId: started.attemptId,
            running: started.state === 'RUNNING',
          };
        },
        handOff: ({ extensionId }) => {
          if (!opened) throw new Error(`${account.name} 주문 수집 시도를 찾지 못했습니다.`);
          return handOff({ extensionId, attempt: opened, input });
        },
        cancel: ({ attemptId }) => cancelMallOrderCollectionAttempt(attemptId),
      });
    },
    cancelInExtension: (attemptId) => {
      // 이 브라우저가 돌리던 절차부터 끊는다. 서버 취소만으로는 페이지 루프가 계속 돈다.
      abortLocalRun?.(attemptId);
      return sendBrowserCollectionControl(attemptId, 'cancelCollectionSession');
    },
    cancelOnServer: cancelMallOrderCollectionAttempt,
    // Order owners assign no publication number, so the completed attempt is
    // the latest collection's identity (KID-189 2c-1).
    readCompleteId: (sources) =>
      findMallSource(sources, account.key)?.lastComplete?.attemptId ?? null,
    onNewComplete: (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.stats() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.pipelines() });
      // 대시보드의 "몰 주문수집" 칸이 들고 있는 마지막 수집 시각(KID-185).
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.collections() });
    },
  };
}
