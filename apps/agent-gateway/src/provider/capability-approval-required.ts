import {
  CapabilityApprovalRequiredEventValueSchema,
  ProviderEventSchema,
  type ProviderEvent,
} from '@kiditem/shared/agent-runtime';

const KIDITEM_MCP_SERVER = 'kiditem';
const KIDITEM_CAPABILITY_INVOKE = 'capability_invoke';
const CLAUDE_KIDITEM_CAPABILITY_INVOKE = 'mcp__kiditem__capability_invoke';
const APPROVAL_ELICITATION_MESSAGE = 'Open KidItem to review the exact capability input.';

/**
 * Extract only the public approval locator from KidItem's fixed MCP v2
 * input_required URL elicitation result. The provider result itself never
 * crosses this adapter boundary.
 */
export function codexCapabilityApprovalRequiredEvent(item: Record<string, unknown>): ProviderEvent | null {
  if (
    item.type !== 'mcpToolCall'
    || item.server !== KIDITEM_MCP_SERVER
    || item.tool !== KIDITEM_CAPABILITY_INVOKE
    || item.status !== 'completed'
  ) return null;
  return capabilityApprovalRequiredEvent(item.result);
}

/** Claude exposes the equivalent result deterministically only as JSON text. */
export function claudeCapabilityApprovalRequiredEvent(name: string, content: unknown): ProviderEvent | null {
  if (name !== CLAUDE_KIDITEM_CAPABILITY_INVOKE || typeof content !== 'string') return null;
  let result: unknown;
  try {
    result = JSON.parse(content) as unknown;
  } catch {
    return null;
  }
  return capabilityApprovalRequiredEvent(result);
}

function capabilityApprovalRequiredEvent(result: unknown): ProviderEvent | null {
  const resultRecord = exactObject(result, ['resultType', 'inputRequests']);
  if (!resultRecord || resultRecord.resultType !== 'input_required') return null;
  const inputRequests = exactObject(resultRecord.inputRequests, ['approval']);
  const approval = inputRequests && exactObject(inputRequests.approval, ['method', 'params']);
  if (!approval || approval.method !== 'elicitation/create') return null;
  const params = exactObject(approval.params, ['mode', 'message', 'url']);
  if (
    !params
    || params.mode !== 'url'
    || params.message !== APPROVAL_ELICITATION_MESSAGE
  ) return null;
  const invocationId = approvalUrlInvocationId(params.url);
  if (!invocationId) return null;
  return ProviderEventSchema.parse({ kind: 'capability.approval_required', invocationId });
}

function approvalUrlInvocationId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:')
    || url.username
    || url.password
    || url.pathname !== '/agent-os'
    || url.hash
  ) return null;
  const queryEntries = [...url.searchParams.entries()];
  if (queryEntries.length !== 1 || queryEntries[0]?.[0] !== 'invocationId') return null;
  const parsed = CapabilityApprovalRequiredEventValueSchema.safeParse({
    invocationId: queryEntries[0][1],
  });
  return parsed.success ? parsed.data.invocationId : null;
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record);
  if (actualKeys.length !== keys.length || keys.some((key) => !Object.hasOwn(record, key))) return null;
  return record;
}
