import { describe, expect, it, vi } from 'vitest';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';
import {
  OpenAiResponsesOperatorRuntimeAdapter,
  type OpenAiResponsesHttpClient,
} from '../openai-responses-operator-runtime.adapter';

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['decisionType'],
  properties: {
    decisionType: { enum: ['delegate', 'ask_user', 'refuse'] },
  },
};

function makeAdapter(client: OpenAiResponsesHttpClient) {
  return new OpenAiResponsesOperatorRuntimeAdapter(client);
}

describe('OpenAiResponsesOperatorRuntimeAdapter', () => {
  it('posts a strict json_schema Responses request and returns output_text', async () => {
    const client: OpenAiResponsesHttpClient = {
      create: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          id: 'resp-1',
          model: 'gpt-5.1',
          output_text: '{"decisionType":"ask_user"}',
          usage: {
            input_tokens: 120,
            output_tokens: 24,
            input_tokens_details: { cached_tokens: 10 },
          },
        },
      }),
    };

    const result = await makeAdapter(client).decide({
      prompt: 'Return JSON.',
      apiKey: 'sk-test',
      model: 'gpt-5.1',
      baseUrl: 'https://api.example.test/v1',
      timeoutMs: 1234,
      outputSchema: schema,
    });

    expect(client.create).toHaveBeenCalledWith({
      url: 'https://api.example.test/v1/responses',
      apiKey: 'sk-test',
      timeoutMs: 1234,
      body: {
        model: 'gpt-5.1',
        input: [{ role: 'user', content: 'Return JSON.' }],
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: 'operator_decision',
            schema,
            strict: true,
          },
        },
      },
    });
    expect(result).toMatchObject({
      provider: 'openai_responses',
      rawOutput: '{"decisionType":"ask_user"}',
      responseId: 'resp-1',
      model: 'gpt-5.1',
      inputTokens: 120,
      outputTokens: 24,
      cachedInputTokens: 10,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('fails closed when OPENAI_API_KEY is missing', async () => {
    const client: OpenAiResponsesHttpClient = {
      create: vi.fn(),
    };

    await expect(
      makeAdapter(client).decide({
        prompt: 'Return JSON.',
        model: 'gpt-5.1',
        outputSchema: schema,
      }),
    ).rejects.toMatchObject({
      code: 'operator_runtime_unavailable',
    });
    expect(client.create).not.toHaveBeenCalled();
  });

  it('maps transport timeout errors to operator_runtime_timeout', async () => {
    const client: OpenAiResponsesHttpClient = {
      create: vi.fn().mockRejectedValue(new DOMException('Timed out', 'AbortError')),
    };

    await expect(
      makeAdapter(client).decide({
        prompt: 'Return JSON.',
        apiKey: 'sk-test',
        model: 'gpt-5.1',
        outputSchema: schema,
      }),
    ).rejects.toMatchObject({
      code: 'operator_runtime_timeout',
    });
  });

  it('redacts API errors before raising runtime failure', async () => {
    const client: OpenAiResponsesHttpClient = {
      create: vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        body: {
          error: {
            message:
              'Invalid schema. Authorization: Bearer sk-secret should not be logged.',
          },
        },
      }),
    };

    await expect(
      makeAdapter(client).decide({
        prompt: 'Return JSON.',
        apiKey: 'sk-test',
        model: 'gpt-5.1',
        outputSchema: schema,
      }),
    ).rejects.toEqual(
      new AgentOsRuntimeError(
        'operator_runtime_failed',
        'OpenAI Responses API request failed with status 400: Invalid schema. Authorization: Bearer [REDACTED] should not be logged.',
      ),
    );
  });

  it('extracts text from the Responses output content array', async () => {
    const client: OpenAiResponsesHttpClient = {
      create: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          id: 'resp-2',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: '{"decisionType":"refuse","reason":"no"}',
                },
              ],
            },
          ],
        },
      }),
    };

    await expect(
      makeAdapter(client).decide({
        prompt: 'Return JSON.',
        apiKey: 'sk-test',
        model: 'gpt-5.1',
        outputSchema: schema,
      }),
    ).resolves.toMatchObject({
      rawOutput: '{"decisionType":"refuse","reason":"no"}',
      responseId: 'resp-2',
    });
  });

  it('fails closed when the model returns a refusal payload', async () => {
    const client: OpenAiResponsesHttpClient = {
      create: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          id: 'resp-refusal',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'refusal',
                  refusal: 'Cannot comply with this request.',
                },
              ],
            },
          ],
        },
      }),
    };

    await expect(
      makeAdapter(client).decide({
        prompt: 'Return JSON.',
        apiKey: 'sk-test',
        model: 'gpt-5.1',
        outputSchema: schema,
      }),
    ).rejects.toEqual(
      new AgentOsRuntimeError(
        'operator_runtime_refused',
        'OpenAI Responses model refused the Operator decision request.',
      ),
    );
  });

  it('rejects non-completed Responses statuses even when text is present', async () => {
    const client: OpenAiResponsesHttpClient = {
      create: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          id: 'resp-incomplete',
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
          output_text: '{"decisionType":"ask_user"}',
        },
      }),
    };

    await expect(
      makeAdapter(client).decide({
        prompt: 'Return JSON.',
        apiKey: 'sk-test',
        model: 'gpt-5.1',
        outputSchema: schema,
      }),
    ).rejects.toEqual(
      new AgentOsRuntimeError(
        'operator_runtime_incomplete',
        'OpenAI Responses API returned status incomplete.',
      ),
    );
  });

  it('rejects successful Responses payloads without output text', async () => {
    const client: OpenAiResponsesHttpClient = {
      create: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: { id: 'resp-empty', output: [] },
      }),
    };

    await expect(
      makeAdapter(client).decide({
        prompt: 'Return JSON.',
        apiKey: 'sk-test',
        model: 'gpt-5.1',
        outputSchema: schema,
      }),
    ).rejects.toMatchObject({
      code: 'operator_runtime_empty',
    });
  });
});
