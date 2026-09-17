import { z } from "zod";
import type { QueryKey } from "@tanstack/react-query";
import {
  COLLECTION_IDLE_POLL_MS,
  COLLECTION_RUNNING_POLL_MS,
  type CollectionSourceAdapter,
} from "@/hooks/use-collection-source-control";
import { apiClient } from "./api-client";
import { isApiError } from "./api-error";
import { collectionSourceStatusQueryOptions } from "./collection-source-status-query";
import { queryKeys } from "./query-keys";
import {
  detectOrderCollectionExtensionRuntime,
  sendToExtension,
} from "./extension-bridge";
import { transferExtensionAuthTo } from "./extension-auth";
import { createSecureRandomUuid } from "./secure-random-uuid";

export const COUPANG_COOKIE_BLOAT_CODE = "coupang_cookie_bloat";
export const COUPANG_SHIPMENT_SESSION_REQUIRED_CODE =
  "coupang_shipment_session_required";
export const COUPANG_SHIPMENT_RESPONSE_INVALID_CODE =
  "coupang_shipment_response_invalid";
const BASE = "/api/coupang-shipments/date-summary";
const entrySchema = z.object({
  date: z.string(),
  count: z.number().int().nonnegative().nullable(),
  boxes: z.number().int().nonnegative().nullable(),
  capturedAt: z.string().datetime(),
  verified: z.boolean(),
});
const attemptSchema = z.object({
  attemptId: z.string().uuid(),
  state: z.enum(["RUNNING", "COMPLETE", "FAILED"]),
  generation: z.string(),
  plan: z.object({
    sourceType: z.literal("coupang_shipment_summary"),
    parserVersion: z.literal("shipment-summary-v1"),
    maxPages: z.number(),
  }),
  expiresAt: z.string().datetime(),
  actualCutoffAt: z.string().datetime().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});
const attemptReadSchema = attemptSchema.extend({
  items: z.array(entrySchema),
  capturedItems: z.array(entrySchema),
});
const sourceSchema = z.object({
  ready: z.boolean(),
  latestAttempt: attemptSchema.nullable(),
  latestComplete: attemptSchema.nullable(),
  items: z.array(entrySchema),
  capturedItems: z.array(entrySchema),
});
export type CoupangShipmentSummarySource = z.infer<typeof sourceSchema>;
export interface CoupangShipmentDateSummaryItem {
  date: string;
  count: number | null;
  boxes: number | null;
}
type CollectedCoupangShipmentDateSummaryItem =
  CoupangShipmentDateSummaryItem & {
    count: number;
    boxes: number;
  };
export type CoupangShipmentSummaryActionResult =
  | { status: "empty"; items: [] }
  | {
      status: "collected";
      items: CoupangShipmentDateSummaryItem[];
      latest: CollectedCoupangShipmentDateSummaryItem;
    };

export class CoupangShipmentExtensionError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "CoupangShipmentExtensionError";
  }
}
export function isCoupangCookieBloatError(error: unknown): boolean {
  return (
    error instanceof CoupangShipmentExtensionError &&
    error.code === COUPANG_COOKIE_BLOAT_CODE
  );
}
export function isCoupangShipmentSessionRequiredError(error: unknown): boolean {
  return (
    error instanceof CoupangShipmentExtensionError &&
    error.code === COUPANG_SHIPMENT_SESSION_REQUIRED_CODE
  );
}
export function loadCoupangShipmentSummarySource(): Promise<CoupangShipmentSummarySource> {
  return apiClient.getParsed(`${BASE}/source`, sourceSchema);
}

/** The owner's operator stop, without the extension's fence token (KID-159). */
export function cancelCoupangShipmentSummaryAttempt(attemptId: string) {
  return apiClient.post(`${BASE}/attempts/${encodeURIComponent(attemptId)}/cancel`);
}


/**
 * The shipment date-summary collection for the shared control. The calendar
 * screen still starts it itself, because the operator picks what to query and
 * the caller reads the collected days back; the control adds the running
 * collection every browser can see and the operator stop it never had.
 *
 * While that screen-owned start is in flight the owner is read at the running
 * cadence, so the control names the attempt within seconds instead of after
 * the next idle read — an 11-second query otherwise ends before the operator
 * is ever offered a stop (KID-170 D3).
 */
export function coupangShipmentSummaryCollectionSource({
  localStartInFlight = false,
}: Readonly<{ localStartInFlight?: boolean }> = {}):
CollectionSourceAdapter<CoupangShipmentSummarySource> {
  return {
    sourceKey: "inventory.coupang_shipment_summary",
    label: "쿠팡 쉽먼트 발송일 조회",
    statusQuery: collectionSourceStatusQueryOptions<
      CoupangShipmentSummarySource,
      Error,
      CoupangShipmentSummarySource,
      QueryKey
    >({
      queryKey: queryKeys.inventory.coupangShipmentSummary(),
      queryFn: loadCoupangShipmentSummarySource,
      refetchInterval: localStartInFlight ? COLLECTION_RUNNING_POLL_MS : COLLECTION_IDLE_POLL_MS,
      refetchIntervalInBackground: false,
      meta: { suppressGlobalErrorToast: true },
    }),
    // 임대가 지난 RUNNING 행은 아무도 돌리고 있지 않다. 재고 owner 읽기와 같은 규칙이다.
    readRunning: (source) => {
      const attempt = source.latestAttempt;
      if (attempt?.state !== "RUNNING") return null;
      if (Date.parse(attempt.expiresAt) <= Date.now()) return null;
      return { attemptId: attempt.attemptId, scopeLabel: null };
    },
    cancelOnServer: cancelCoupangShipmentSummaryAttempt,
    readCompleteId: (source) => source.latestComplete?.generation ?? null,
    // 대시보드의 "쿠팡 쉽먼트" 칸이 들고 있는 마지막 수집 시각(KID-185).
    onNewComplete: (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.collections() });
    },
  };
}

/** Both manual buttons use the same owner; the page never receives or uploads provider rows. */
export async function collectAndPersistCoupangShipmentSummary(): Promise<CoupangShipmentSummaryActionResult> {
  const runtime = await detectOrderCollectionExtensionRuntime(1_200, [
    "coupangShipmentSummarySourceOwnerV1",
  ]);
  if (runtime.status === "incompatible")
    throw new Error("주문수집 확장프로그램을 새로고침한 뒤 다시 시도해주세요.");
  if (runtime.status !== "ready") {
    if (
      window.location.hostname === "localhost" &&
      window.location.port !== "3000"
    ) {
      throw new Error(
        "주문수집 확장프로그램은 로컬 앱의 http://localhost:3000 에서 연결됩니다. 웹 앱을 3000 포트로 열어 다시 시도해주세요.",
      );
    }
    throw new Error(
      "주문수집 확장프로그램이 필요합니다. extensions/kiditem-os를 Chrome에서 로드한 뒤 다시 시도해주세요.",
    );
  }
  await transferExtensionAuthTo(runtime.extensionId);
  const key = createSecureRandomUuid();
  const begin = () =>
    apiClient.post<unknown>(
      `${BASE}/attempts`,
      {},
      { headers: { "Idempotency-Key": key } },
    );
  let started: unknown;
  try {
    started = await begin();
  } catch (error) {
    if (!isApiError(error) || (error.status !== 0 && error.status < 500))
      throw error;
    started = await begin(); // Lost begin response replays the same explicit action, never a new generation.
  }
  const attempt = attemptSchema.parse(started);
  if (attempt.state === "RUNNING") {
    await sendToExtension(
      runtime.extensionId,
      {
        action: "collectCoupangShipmentDateSummary",
        attemptId: attempt.attemptId,
      },
      90_000,
    ).catch(() => undefined);
  }
  const saved = await apiClient.getParsed(
    `${BASE}/attempts/${attempt.attemptId}`,
    attemptReadSchema,
  );
  if (saved.attemptId !== attempt.attemptId)
    throw new Error("발송일 요약 저장을 서버에서 확인하지 못했습니다.");
  if (saved.state !== "COMPLETE")
    throw new CoupangShipmentExtensionError(
      saved.errorMessage ??
        "쉽먼트 조회가 아직 진행 중입니다. 서버 상태를 확인해주세요.",
      saved.errorCode ?? "SOURCE_RUNNING",
    );
  if (saved.capturedItems.length === 0) return { status: "empty", items: [] };
  const item = ({ date, count, boxes }: CoupangShipmentDateSummaryItem) => ({
    date,
    count,
    boxes,
  });
  const latest = [...saved.capturedItems].sort((a, b) =>
    b.date.localeCompare(a.date),
  )[0]!;
  if (latest.count === null || latest.boxes === null) {
    throw new Error("검증된 쉽먼트 요약에 측정값이 없습니다.");
  }
  return {
    status: "collected",
    items: saved.items.map(item),
    latest: { date: latest.date, count: latest.count, boxes: latest.boxes },
  };
}
