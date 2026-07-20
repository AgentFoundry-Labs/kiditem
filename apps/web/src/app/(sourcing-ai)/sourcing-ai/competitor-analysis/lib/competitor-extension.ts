import {
  detectExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from "@/lib/extension-bridge";

export const COMPETITOR_EXTENSION_MIN_VERSION = "1.2.33";

export type CompetitorExtensionGate =
  | { status: "ready"; extensionId: string; version: string }
  | { status: "chrome_required" }
  | { status: "missing" }
  | { status: "outdated"; version: string | null };

interface ExtensionPingResponse {
  success?: boolean;
  version?: string;
  capabilities?: {
    coupangKeywordRank?: boolean;
    coupangCompetitorSeller?: boolean;
    coupangCompetitorSellerCatalog?: boolean;
    coupangCompetitorSellerCatalogOnDemand?: boolean;
    browserCollectionSessions?: boolean;
  };
}

export interface CompetitorCollectionRun {
  success?: boolean;
  started?: boolean;
  total?: number;
  runId?: string | null;
  error?: string;
}

export interface CompetitorCollectionRunStatus {
  status: "idle" | "starting" | "running" | "done" | "error" | string;
  runId?: string | null;
  total?: number;
  completed?: number;
  failed?: number;
  current?: string | null;
  sellerId?: string | null;
  sellerName?: string | null;
  catalogProductCount?: number;
  error?: string;
}

export async function detectCompetitorExtensionGate(): Promise<CompetitorExtensionGate> {
  if (!isChromeExtensionRuntimeAvailable())
    return { status: "chrome_required" };
  const extensionId = await detectExtensionId();
  if (!extensionId) return { status: "missing" };
  const ping = await sendToExtension<ExtensionPingResponse>(extensionId, {
    action: "ping",
  }).catch(() => null);
  if (!ping?.success) return { status: "missing" };
  const version = typeof ping.version === "string" ? ping.version : null;
  if (
    !version ||
    !isVersionAtLeast(version, COMPETITOR_EXTENSION_MIN_VERSION) ||
    !ping.capabilities?.coupangKeywordRank ||
    !ping.capabilities?.coupangCompetitorSeller ||
    !ping.capabilities?.coupangCompetitorSellerCatalog ||
    !ping.capabilities?.coupangCompetitorSellerCatalogOnDemand ||
    !ping.capabilities?.browserCollectionSessions
  ) {
    return { status: "outdated", version };
  }
  return { status: "ready", extensionId, version };
}

export function competitorExtensionGateMessage(
  gate: CompetitorExtensionGate,
): string | null {
  if (gate.status === "chrome_required") {
    return "쿠팡 판매자 수집은 Chrome의 KIDITEM 쿠팡 확장프로그램에서 실행됩니다.";
  }
  if (gate.status === "missing") {
    return "KIDITEM 쿠팡 확장프로그램을 설치하거나 다시 연결해 주세요.";
  }
  if (gate.status === "outdated") {
    return `chrome://extensions 에서 KIDITEM 쿠팡 확장프로그램을 새로고침해 주세요. (필요 버전 ${COMPETITOR_EXTENSION_MIN_VERSION}+)`;
  }
  return null;
}

export async function runCompetitorCollection(
  extensionId: string,
  runId?: string,
): Promise<CompetitorCollectionRun> {
  const response = await sendToExtension<CompetitorCollectionRun>(extensionId, {
    action: "runCoupangKeywordRankCheck",
    ...(runId ? { runId } : {}),
  });
  if (!response?.success) {
    throw new Error(
      response?.error ?? "쿠팡 경쟁 판매자 수집을 시작하지 못했습니다.",
    );
  }
  return response;
}

export async function getCompetitorCollectionStatus(
  extensionId: string,
  runId: string,
): Promise<CompetitorCollectionRunStatus> {
  const response = await sendToExtension<CompetitorCollectionRunStatus>(
    extensionId,
    { action: "getCoupangRankCheckStatus", runId },
  );
  return response ?? { status: "idle", runId };
}

export async function runCompetitorSellerCollection(
  extensionId: string,
  sellerId: string,
  runId?: string,
): Promise<CompetitorCollectionRun> {
  const response = await sendToExtension<CompetitorCollectionRun>(
    extensionId,
    {
      action: "runCoupangCompetitorSellerCatalog",
      sellerId,
      ...(runId ? { runId } : {}),
    },
    30_000,
  );
  if (!response?.success) {
    throw new Error(
      response?.error ?? "선택한 판매자의 상품 수집을 시작하지 못했습니다.",
    );
  }
  return response;
}

export async function getCompetitorSellerCollectionStatus(
  extensionId: string,
  runId: string,
): Promise<CompetitorCollectionRunStatus> {
  const response = await sendToExtension<CompetitorCollectionRunStatus>(
    extensionId,
    {
      action: "getCoupangCompetitorSellerCatalogStatus",
      runId,
    },
  );
  return response ?? { status: "idle", runId };
}

export function isVersionAtLeast(current: string, minimum: string): boolean {
  const currentParts = current
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const minimumParts = minimum
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const size = Math.max(currentParts.length, minimumParts.length);
  for (let index = 0; index < size; index += 1) {
    const currentValue = currentParts[index] ?? 0;
    const minimumValue = minimumParts[index] ?? 0;
    if (currentValue > minimumValue) return true;
    if (currentValue < minimumValue) return false;
  }
  return true;
}
