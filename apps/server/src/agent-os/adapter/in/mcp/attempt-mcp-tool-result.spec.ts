import { describe, expect, it, vi } from 'vitest';
import { z as z4 } from 'zod-v4';
import {
  ATTEMPT_MCP_TOOL_RESULT_MAX_BYTES,
  AttemptMcpToolResultSchema,
  attemptMcpToolResult,
} from './attempt-mcp-tool-result';

describe('Attempt MCP tool result envelope', () => {
  it('returns the same bounded success envelope as structured content and text', async () => {
    const work = vi.fn().mockResolvedValue({
      error: { code: 'ordinary_business_state', message: 'This is data, not a transport failure.' },
      invocationId: '018f4eb1-9078-7a1e-9514-b19b5732f5de',
    });

    const result = await attemptMcpToolResult(work);

    expect(work).toHaveBeenCalledTimes(1);
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      ok: true,
      result: {
        error: { code: 'ordinary_business_state', message: 'This is data, not a transport failure.' },
        invocationId: '018f4eb1-9078-7a1e-9514-b19b5732f5de',
      },
    });
    expect(result.content).toEqual([{
      type: 'text',
      text: JSON.stringify(result.structuredContent),
    }]);
  });

  it('normalizes a thrown application error into the strict error envelope', async () => {
    const error = Object.assign(new Error('m'.repeat(1_100)), { code: 'c'.repeat(200) });

    const result = await attemptMcpToolResult(async () => { throw error; });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      ok: false,
      error: { code: 'c'.repeat(128), message: 'm'.repeat(1_000) },
    });
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
    expect(AttemptMcpToolResultSchema.safeParse({ ...result.structuredContent, forged: true }).success).toBe(false);
  });

  it('rejects oversized and non-canonical application results without leaking them', async () => {
    const oversized = await attemptMcpToolResult(async () => ({ payload: 'x'.repeat(ATTEMPT_MCP_TOOL_RESULT_MAX_BYTES) }));
    const nonCanonical = await attemptMcpToolResult(async () => ({ value: Number.NaN }));

    for (const result of [oversized, nonCanonical]) {
      expect(result).toMatchObject({
        isError: true,
        structuredContent: {
          ok: false,
          error: { code: 'attempt_mcp_result_invalid' },
        },
      });
      expect(Buffer.byteLength(result.content[0].text, 'utf8')).toBeLessThanOrEqual(ATTEMPT_MCP_TOOL_RESULT_MAX_BYTES);
    }
  });

  it('exports its output contract as a Zod 4 schema', () => {
    expect(AttemptMcpToolResultSchema).toBeInstanceOf(z4.ZodType);
    expect(AttemptMcpToolResultSchema.safeParse({ ok: true, result: { accepted: true } }).success).toBe(true);
    expect(AttemptMcpToolResultSchema.safeParse({ ok: false, error: { code: 'failed', message: 'failed' } }).success).toBe(true);
  });
});
