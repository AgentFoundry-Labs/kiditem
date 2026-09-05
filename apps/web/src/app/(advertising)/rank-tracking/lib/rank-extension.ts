// Wing 판매순위 일괄 수집 시작과 진행률 조회를 위한 확장 래퍼.

import {
  detectExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from "@/lib/extension-bridge";
import { KIDITEM_EXTENSION_MIN_VERSION } from '@/lib/extension-version';

// 통합 확장(kiditem-os)은 세 확장을 합치며 버전을 1.0.0 으로 리셋했다. 개별
// 기능 판정은 아래 ping capability 가 하고, 버전은 병합 이전 설치만 걸러낸다.
export const RANK_EXTENSION_MIN_VERSION = KIDITEM_EXTENSION_MIN_VERSION;

export const RANK_EXTENSION_CHROME_REQUIRED =
  "Wing 판매순위 수집은 Chrome 확장프로그램으로 실행됩니다. Chrome에서 이 페이지를 열어주세요.";
export const RANK_EXTENSION_REQUIRED =
  "KIDITEM 쿠팡 확장프로그램을 설치/새로고침한 뒤 다시 실행하세요.";
export const RANK_EXTENSION_RELOAD_REQUIRED = `KIDITEM 쿠팡 확장프로그램이 예전 버전입니다. chrome://extensions 에서 확장프로그램을 새로고침한 뒤 다시 실행하세요. (필요 버전 ${RANK_EXTENSION_MIN_VERSION}+)`;

export type RankExtensionGate =
  | { status: "ready"; extensionId: string; version: string | null }
  | { status: "chrome_required" }
  | { status: "missing" }
  | { status: "outdated"; extensionId: string; version: string | null };

interface KidItemExtensionPingResponse {
  success?: boolean;
  version?: string;
  capabilities?: {
    coupangKeywordRank?: boolean;
    wingCatalogSalesRank?: boolean;
    wingCatalogSalesRankCancel?: boolean;
    browserCollectionSessions?: boolean;
  };
}

export interface RunRankCheckResponse {
  success?: boolean;
  started?: boolean;
  total?: number;
  productTotal?: number;
  pendingProductTotal?: number;
  resumed?: boolean;
  runId?: string | null;
  error?: string;
}

export interface RankCheckStatus {
  status: "idle" | "starting" | "running" | "done" | "error" | string;
  runId?: string | null;
  total?: number;
  productTotal?: number;
  pendingProductTotal?: number;
  resumed?: boolean;
  completed?: number;
  failed?: number;
  rankedProducts?: number;
  current?: string | null;
  currentProducts?: number;
  currentIndex?: number;
  failures?: Array<{ keyword: string; error: string }>;
  error?: string;
  startedAt?: number;
  endedAt?: number;
  heartbeatAt?: number;
  staleRunId?: string;
  cancelRequested?: boolean;
  cancelled?: boolean;
}

export function isRankExtensionVersionAtLeast(
  current: string | null | undefined,
  minimum: string,
): boolean {
  if (!current) return false;
  const currentParts = current
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const minimumParts = minimum
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(currentParts.length, minimumParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const currentValue = currentParts[index] ?? 0;
    const minimumValue = minimumParts[index] ?? 0;
    if (currentValue > minimumValue) return true;
    if (currentValue < minimumValue) return false;
  }
  return true;
}

/** 확장 설치/버전/coupangKeywordRank capability 게이트 판정. */
export async function detectRankExtensionGate(): Promise<RankExtensionGate> {
  if (!isChromeExtensionRuntimeAvailable())
    return { status: "chrome_required" };

  const extensionId = await detectExtensionId();
  if (!extensionId) return { status: "missing" };

  const ping = await sendToExtension<KidItemExtensionPingResponse>(
    extensionId,
    {
      action: "ping",
    },
  ).catch(() => null);
  if (!ping?.success) return { status: "missing" };

  const version = typeof ping.version === "string" ? ping.version : null;
  if (
    !ping.capabilities?.wingCatalogSalesRank ||
    !ping.capabilities?.wingCatalogSalesRankCancel ||
    !ping.capabilities?.browserCollectionSessions ||
    !isRankExtensionVersionAtLeast(version, RANK_EXTENSION_MIN_VERSION)
  ) {
    return { status: "outdated", extensionId, version };
  }
  return { status: "ready", extensionId, version };
}

export function rankExtensionGateMessage(
  gate: RankExtensionGate,
): string | null {
  if (gate.status === "chrome_required") return RANK_EXTENSION_CHROME_REQUIRED;
  if (gate.status === "missing") return RANK_EXTENSION_REQUIRED;
  if (gate.status === "outdated") return RANK_EXTENSION_RELOAD_REQUIRED;
  return null;
}

/** 활성 트래커 전체 일괄 확인 시작 — 즉시 runId 반환, 진행률은 status 폴링. */
export async function runWingSalesRankCheck(
  extensionId: string,
  runId?: string,
): Promise<RunRankCheckResponse> {
  const response = await sendToExtension<RunRankCheckResponse>(extensionId, {
    action: "runWingSalesRankCheck",
    ...(runId ? { runId } : {}),
  });
  if (!response?.success) {
    throw new Error(response?.error ?? "Wing 판매순위 일괄 확인 시작 실패");
  }
  return response;
}

export async function getWingSalesRankCheckStatus(
  extensionId: string,
  runId?: string | null,
): Promise<RankCheckStatus> {
  const response = await sendToExtension<RankCheckStatus>(extensionId, {
    action: "getWingSalesRankCheckStatus",
    ...(runId ? { runId } : {}),
  });
  return response ?? { status: "idle" };
}
