import { z } from "zod";
import { apiClient } from "./api-client";
import { isApiError } from "./api-error";
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
  count: z.number().int().nonnegative(),
  boxes: z.number().int().nonnegative(),
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
  status: z.enum(["READY", "STALE", "MISSING"]),
  refreshing: z.boolean(),
  latestAttempt: attemptSchema.nullable(),
  latestComplete: attemptSchema.nullable(),
  items: z.array(entrySchema),
  capturedItems: z.array(entrySchema),
});
export type CoupangShipmentSummarySource = z.infer<typeof sourceSchema>;
export interface CoupangShipmentDateSummaryItem {
  date: string;
  count: number;
  boxes: number;
}
export type CoupangShipmentSummaryActionResult =
  | { status: "empty"; items: [] }
  | {
      status: "collected";
      items: CoupangShipmentDateSummaryItem[];
      latest: CoupangShipmentDateSummaryItem;
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
  return {
    status: "collected",
    items: saved.items.map(item),
    latest: item(latest),
  };
}
