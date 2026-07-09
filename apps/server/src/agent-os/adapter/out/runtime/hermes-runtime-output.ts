export interface HermesRuntimeUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  costMicros?: bigint;
}

export interface HermesTranscriptEvent {
  type: 'assistant' | 'tool' | 'system' | 'thinking' | 'error';
  message: string;
  data: Record<string, unknown>;
}

export interface HermesRuntimeOutput {
  finalText: string;
  sessionId: string | null;
  usage: HermesRuntimeUsage;
  transcriptEvents: HermesTranscriptEvent[];
}

const SESSION_ID_PATTERNS = [
  /^session_id:\s*(\S+)/i,
  /^session:\s*(\S+)/i,
  /^hermes_session_id:\s*(\S+)/i,
] as const;

const SECURITY_SCANNER_PATTERN = /^⚠\s+tirith security scanner enabled\b/i;

function positiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function bigintMicros(value: unknown): bigint | undefined {
  if (typeof value === 'bigint' && value >= 0n) return value;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return BigInt(value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  return undefined;
}

function parseJsonObject(line: string): Record<string, unknown> | null {
  if (!line.startsWith('{') || !line.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(line) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function mergeUsage(target: HermesRuntimeUsage, source: Record<string, unknown>): boolean {
  const inputTokens = positiveInteger(source.input_tokens ?? source.inputTokens);
  const outputTokens = positiveInteger(source.output_tokens ?? source.outputTokens);
  const cachedInputTokens = positiveInteger(
    source.cached_input_tokens ?? source.cachedInputTokens,
  );
  const costMicros = bigintMicros(source.cost_micros ?? source.costMicros);
  const hasUsage =
    inputTokens !== undefined ||
    outputTokens !== undefined ||
    cachedInputTokens !== undefined ||
    costMicros !== undefined;

  if (inputTokens !== undefined) target.inputTokens = inputTokens;
  if (outputTokens !== undefined) target.outputTokens = outputTokens;
  if (cachedInputTokens !== undefined) target.cachedInputTokens = cachedInputTokens;
  if (costMicros !== undefined) target.costMicros = costMicros;
  return hasUsage;
}

function parseUsageLine(line: string): Record<string, unknown> | null {
  if (!/^\[usage\]\s+/i.test(line)) return null;
  const usage: Record<string, unknown> = {};
  for (const part of line.replace(/^\[usage\]\s+/i, '').split(/\s+/)) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    usage[part.slice(0, separator)] = part.slice(separator + 1);
  }
  return usage;
}

function metadataSessionId(line: string): string | null {
  for (const pattern of SESSION_ID_PATTERNS) {
    const match = line.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function transcriptType(value: unknown): HermesTranscriptEvent['type'] | null {
  if (
    value === 'assistant' ||
    value === 'tool' ||
    value === 'system' ||
    value === 'thinking' ||
    value === 'error'
  ) {
    return value;
  }
  return null;
}

export function parseHermesRuntimeOutput(input: {
  stdout: string;
  stderr?: string;
  durationMs?: number;
}): HermesRuntimeOutput {
  let sessionId: string | null = null;
  const usage: HermesRuntimeUsage = {};
  const finalLines: string[] = [];
  const transcriptEvents: HermesTranscriptEvent[] = [];

  input.stdout.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (SECURITY_SCANNER_PATTERN.test(trimmed)) return;

    const lineSessionId = metadataSessionId(trimmed);
    if (lineSessionId) {
      sessionId = lineSessionId;
      return;
    }

    const usageLine = parseUsageLine(trimmed);
    if (usageLine && mergeUsage(usage, usageLine)) return;

    const jsonObject = parseJsonObject(trimmed);
    if (jsonObject) {
      if (typeof jsonObject.session_id === 'string' && jsonObject.session_id.trim()) {
        sessionId = jsonObject.session_id.trim();
      }
      const jsonType = typeof jsonObject.type === 'string' ? jsonObject.type : null;
      const isUsageMetadata =
        jsonType === 'token_usage' ||
        jsonType === 'usage' ||
        jsonType === 'cost';
      if (isUsageMetadata && mergeUsage(usage, jsonObject)) return;

      const eventType = transcriptType(jsonObject.type);
      const message =
        typeof jsonObject.message === 'string'
          ? jsonObject.message
          : typeof jsonObject.content === 'string'
            ? jsonObject.content
            : null;
      if (eventType && message) {
        transcriptEvents.push({
          type: eventType,
          message,
          data: { ...jsonObject, line: index + 1 },
        });
        if (eventType !== 'assistant') return;
        finalLines.push(message);
        return;
      }
    }

    finalLines.push(line);
    transcriptEvents.push({
      type: 'assistant',
      message: line,
      data: {
        line: index + 1,
        ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
      },
    });
  });

  return {
    finalText: finalLines.join('\n').trim(),
    sessionId,
    usage,
    transcriptEvents,
  };
}
