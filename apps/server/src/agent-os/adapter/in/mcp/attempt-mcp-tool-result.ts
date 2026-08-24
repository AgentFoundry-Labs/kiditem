import { BoundedCanonicalJsonSchema } from '@kiditem/shared/agent-interaction';
import { z as z4 } from 'zod-v4';

export const ATTEMPT_MCP_TOOL_RESULT_MAX_BYTES = 64 * 1024;

const AttemptMcpToolErrorSchema = z4.object({
  code: z4.string().max(128),
  message: z4.string().max(1_000),
}).strict();

export const AttemptMcpToolResultSchema = z4.union([
  z4.object({
    ok: z4.literal(true),
    result: z4.unknown(),
  }).strict(),
  z4.object({
    ok: z4.literal(false),
    error: AttemptMcpToolErrorSchema,
  }).strict(),
]);

export type AttemptMcpToolResultEnvelope = z4.output<typeof AttemptMcpToolResultSchema>;

export type AttemptMcpRenderedToolResult = {
  content: [{ type: 'text'; text: string }];
  structuredContent: AttemptMcpToolResultEnvelope;
  isError?: true;
};

export async function attemptMcpToolResult(
  work: () => Promise<unknown> | unknown,
): Promise<AttemptMcpRenderedToolResult> {
  try {
    const result = await work();
    if (!BoundedCanonicalJsonSchema.safeParse(result).success) {
      return renderedFailure('attempt_mcp_result_invalid', 'Attempt MCP result must be bounded canonical JSON.');
    }
    const envelope: AttemptMcpToolResultEnvelope = { ok: true, result };
    return render(envelope);
  } catch (error) {
    return renderedFailure(errorCode(error), errorMessage(error));
  }
}

function renderedFailure(code: string, message: string): AttemptMcpRenderedToolResult {
  return render({
    ok: false,
    error: {
      code: boundedText(code || 'attempt_mcp_tool_failed', 128),
      message: boundedText(message || 'Attempt MCP tool failed.', 1_000),
    },
  });
}

function render(envelope: AttemptMcpToolResultEnvelope): AttemptMcpRenderedToolResult {
  const text = JSON.stringify(envelope);
  if (Buffer.byteLength(text, 'utf8') > ATTEMPT_MCP_TOOL_RESULT_MAX_BYTES) {
    return renderedFailure('attempt_mcp_result_invalid', 'Attempt MCP result exceeds the transport limit.');
  }
  return {
    content: [{ type: 'text', text }],
    structuredContent: envelope,
    ...(envelope.ok ? {} : { isError: true }),
  };
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : 'attempt_mcp_tool_failed';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Attempt MCP tool failed.';
}

function boundedText(value: string, maximum: number): string {
  return value.slice(0, maximum);
}
