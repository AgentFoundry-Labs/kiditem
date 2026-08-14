import {
  detectExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from "@/lib/extension-bridge";
import { KIDITEM_EXTENSION_MIN_VERSION } from '@/lib/extension-version';

// 통합 확장(kiditem-os)은 세 확장을 합치며 버전을 1.0.0 으로 리셋했다. 개별
// 기능 판정은 아래 ping capability 가 하고, 버전은 병합 이전 설치만 걸러낸다.
export const COMPETITOR_EXTENSION_MIN_VERSION = KIDITEM_EXTENSION_MIN_VERSION;

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
