import {
  CAPABILITY_APPROVAL_REQUIRED_CUSTOM_EVENT_NAME,
  CapabilityApprovalRequiredEventValueSchema,
} from '@kiditem/shared/agent-runtime';

/** Accept only the bounded AG-UI CUSTOM value, never a provider tool payload. */
export function capabilityApprovalInvocationIdFromAgUiEvent(event: unknown): string | null {
  const record = object(event);
  if (!record || record.name !== CAPABILITY_APPROVAL_REQUIRED_CUSTOM_EVENT_NAME) return null;
  const parsed = CapabilityApprovalRequiredEventValueSchema.safeParse(record.value);
  return parsed.success ? parsed.data.invocationId : null;
}

/** Merge route fallback and streamed locators without widening either input. */
export function dedupeCapabilityApprovalInvocationIds(
  streamedInvocationIds: readonly string[],
  fallbackInvocationId?: string | null,
): readonly string[] {
  const invocationIds: string[] = [];
  for (const candidate of [...streamedInvocationIds, fallbackInvocationId]) {
    const parsed = CapabilityApprovalRequiredEventValueSchema.safeParse({ invocationId: candidate });
    if (parsed.success && !invocationIds.includes(parsed.data.invocationId)) {
      invocationIds.push(parsed.data.invocationId);
    }
  }
  return invocationIds;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
