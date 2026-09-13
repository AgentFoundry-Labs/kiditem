import {
  detectExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from "@/lib/extension-bridge";
import { KIDITEM_EXTENSION_MIN_VERSION } from '@/lib/extension-version';
import type { CompetitorCatalogAttemptInput } from './competitor-tracking-api';

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

export interface CompetitorCatalogCollectionReply {
  success: boolean;
  attemptId: string;
  terminalState: 'RUNNING' | 'COMPLETE' | 'FAILED';
  retryRequired?: boolean;
  attentionRequired?: boolean;
  capturedTargetCount?: number;
  errorCode?: string;
  error?: string;
}

function parseCompetitorCatalogCollectionReply(
  value: unknown,
): CompetitorCatalogCollectionReply {
  const record = isRecord(value) ? value : null;
  if (
    !record ||
    typeof record.success !== 'boolean' ||
    typeof record.attemptId !== 'string' ||
    (record.terminalState !== 'RUNNING' &&
      record.terminalState !== 'COMPLETE' &&
      record.terminalState !== 'FAILED')
  ) {
    throw new Error('KIDITEM 쿠팡 확장프로그램이 경쟁 판매자 수집 결과를 올바르게 반환하지 않았습니다.');
  }
  const reply: CompetitorCatalogCollectionReply = {
    success: record.success,
    attemptId: record.attemptId,
    terminalState: record.terminalState,
  };
  if (record.retryRequired !== undefined) {
    if (typeof record.retryRequired !== 'boolean') throw new Error('KIDITEM 쿠팡 확장프로그램이 경쟁 판매자 수집 결과를 올바르게 반환하지 않았습니다.');
    reply.retryRequired = record.retryRequired;
  }
  if (record.attentionRequired !== undefined) {
    if (typeof record.attentionRequired !== 'boolean') throw new Error('KIDITEM 쿠팡 확장프로그램이 경쟁 판매자 수집 결과를 올바르게 반환하지 않았습니다.');
    reply.attentionRequired = record.attentionRequired;
  }
  if (record.capturedTargetCount !== undefined) {
    if (typeof record.capturedTargetCount !== 'number' || !Number.isInteger(record.capturedTargetCount) || record.capturedTargetCount < 0) throw new Error('KIDITEM 쿠팡 확장프로그램이 경쟁 판매자 수집 결과를 올바르게 반환하지 않았습니다.');
    reply.capturedTargetCount = record.capturedTargetCount;
  }
  if (record.errorCode !== undefined) {
    if (typeof record.errorCode !== 'string') throw new Error('KIDITEM 쿠팡 확장프로그램이 경쟁 판매자 수집 결과를 올바르게 반환하지 않았습니다.');
    reply.errorCode = record.errorCode;
  }
  if (record.error !== undefined) {
    if (typeof record.error !== 'string') throw new Error('KIDITEM 쿠팡 확장프로그램이 경쟁 판매자 수집 결과를 올바르게 반환하지 않았습니다.');
    reply.error = record.error;
  }
  return reply;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function requireCompetitorCatalogExtension(): Promise<string> {
  const gate = await detectCompetitorExtensionGate();
  if (gate.status === 'ready') return gate.extensionId;
  throw new Error(
    competitorExtensionGateMessage(gate)
      ?? 'KIDITEM 쿠팡 확장프로그램을 연결한 뒤 다시 시도해주세요.',
  );
}

export async function collectCompetitorCatalogFromExtension(input: {
  extensionId: string;
  idempotencyKey: string;
  input: CompetitorCatalogAttemptInput;
}): Promise<CompetitorCatalogCollectionReply> {
  const response = await sendToExtension<unknown>(
    input.extensionId,
    {
      action: 'collectAdvertisingCompetitorCatalog',
      idempotencyKey: input.idempotencyKey,
      ...input.input,
    },
    null,
  );
  return parseCompetitorCatalogCollectionReply(response);
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
