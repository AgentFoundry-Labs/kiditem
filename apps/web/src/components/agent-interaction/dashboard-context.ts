import {
  CanonicalResourceRefSchema,
  DashboardContextSchema,
  InteractionRouteKeySchema,
  type DashboardContext,
} from '@kiditem/shared/agent-interaction';

const SENSITIVE_KEY = /(?:secret|token|password|cookie|auth|organization|role|html|url)/i;

function safeRecord(value: unknown, allowNull: boolean): Record<string, string | number | boolean | null | string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: Record<string, string | number | boolean | null | string[]> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') output[key] = item;
    else if (allowNull && item === null) output[key] = null;
    else if (!allowNull && Array.isArray(item) && item.every((entry) => typeof entry === 'string')) output[key] = item.slice(0, 50);
  }
  return output;
}

export function projectDashboardContext(input: Record<string, unknown>): DashboardContext {
  const refs = Array.isArray(input.resourceRefs) ? input.resourceRefs : [];
  const resourceRefs = refs.slice(0, 50).flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const candidate = value as Record<string, unknown>;
    const parsed = CanonicalResourceRefSchema.safeParse({
      kind: candidate.kind,
      id: candidate.id,
      version: candidate.version ?? null,
    });
    return parsed.success ? [parsed.data] : [];
  });

  return DashboardContextSchema.parse({
    routeKey: InteractionRouteKeySchema.parse(input.routeKey),
    resourceRefs,
    filters: safeRecord(input.filters, false),
    visibleRowIds: Array.isArray(input.visibleRowIds)
      ? input.visibleRowIds.filter((value): value is string => typeof value === 'string' && value.length > 0).slice(0, 100)
      : [],
    aggregateSummary: safeRecord(input.aggregateSummary, true),
    locale: typeof input.locale === 'string' ? input.locale : 'ko-KR',
    timezone: typeof input.timezone === 'string' ? input.timezone : 'Asia/Seoul',
  });
}
