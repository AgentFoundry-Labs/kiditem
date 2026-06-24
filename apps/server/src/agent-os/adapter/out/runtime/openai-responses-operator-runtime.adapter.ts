import { readFileSync } from 'node:fs';
import { Injectable, Optional } from '@nestjs/common';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RUNTIME_ERROR_CHARS = 2_000;

type JsonObject = Record<string, unknown>;

export interface OpenAiResponsesHttpInput {
  url: string;
  apiKey: string;
  body: JsonObject;
  timeoutMs: number;
}

export interface OpenAiResponsesHttpResult {
  ok: boolean;
  status: number;
  body: unknown;
}

export interface OpenAiResponsesHttpClient {
  create(input: OpenAiResponsesHttpInput): Promise<OpenAiResponsesHttpResult>;
}

export interface OpenAiResponsesOperatorRuntimeInput {
  prompt: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  outputSchema?: unknown;
  outputSchemaPath?: string;
}

export interface OpenAiResponsesOperatorRuntimeResult {
  provider: 'openai_responses';
  rawOutput: string;
  responseId: string | null;
  model: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}

function asRecord(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null
    ? (value as JsonObject)
    : null;
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function compactRuntimeError(message: string): string {
  return message
    .replace(/Bearer\s+[\w.-]+/gi, 'Bearer [REDACTED]')
    .replace(/sk-[\w-]+/gi, 'sk-[REDACTED]')
    .slice(-MAX_RUNTIME_ERROR_CHARS)
    .trim();
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function readOutputSchema(input: OpenAiResponsesOperatorRuntimeInput): unknown {
  if (input.outputSchema !== undefined) {
    return input.outputSchema;
  }
  if (input.outputSchemaPath) {
    return JSON.parse(readFileSync(input.outputSchemaPath, 'utf8')) as unknown;
  }
  throw new AgentOsRuntimeError(
    'operator_runtime_schema_required',
    'OpenAI Responses Operator runtime requires an output schema.',
  );
}

function buildResponsesUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/responses`;
}

function errorMessageFromBody(body: unknown): string {
  const record = asRecord(body);
  const error = asRecord(record?.error);
  const message = stringField(error?.message) ?? stringField(record?.message);
  if (message) return message;

  try {
    return JSON.stringify(body);
  } catch {
    return 'OpenAI Responses API request failed.';
  }
}

function responseTextFromContent(content: unknown): string | null {
  if (!Array.isArray(content)) return null;

  for (const item of content) {
    const record = asRecord(item);
    const text = stringField(record?.text);
    if (text) return text;
  }

  return null;
}

function hasRefusalContent(content: unknown): boolean {
  if (!Array.isArray(content)) return false;

  return content.some((item) => {
    const record = asRecord(item);
    return stringField(record?.refusal) !== null || record?.type === 'refusal';
  });
}

function extractOutputText(body: unknown): string | null {
  const record = asRecord(body);
  const outputText = stringField(record?.output_text);
  if (outputText) return outputText;

  const output = record?.output;
  if (!Array.isArray(output)) return null;

  for (const item of output) {
    const outputItem = asRecord(item);
    const itemText = responseTextFromContent(outputItem?.content);
    if (itemText) return itemText;
  }

  return null;
}

function hasModelRefusal(body: unknown): boolean {
  const record = asRecord(body);
  if (stringField(record?.refusal)) return true;

  const output = record?.output;
  if (!Array.isArray(output)) return false;

  return output.some((item) => hasRefusalContent(asRecord(item)?.content));
}

function responseStatus(body: unknown): string | null {
  return stringField(asRecord(body)?.status);
}

function usageNumber(body: unknown, key: string): number | undefined {
  const usage = asRecord(asRecord(body)?.usage);
  return numberField(usage?.[key]);
}

function cachedInputTokens(body: unknown): number | undefined {
  const usage = asRecord(asRecord(body)?.usage);
  const details = asRecord(usage?.input_tokens_details);
  return numberField(details?.cached_tokens);
}

export class FetchOpenAiResponsesHttpClient
  implements OpenAiResponsesHttpClient
{
  async create(
    input: OpenAiResponsesHttpInput,
  ): Promise<OpenAiResponsesHttpResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const response = await fetch(input.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input.body),
        signal: controller.signal,
      });
      const responseText = await response.text();
      let body: unknown = responseText;
      if (responseText.trim().length > 0) {
        try {
          body = JSON.parse(responseText) as unknown;
        } catch {
          body = responseText;
        }
      }

      return {
        ok: response.ok,
        status: response.status,
        body,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

@Injectable()
export class OpenAiResponsesOperatorRuntimeAdapter {
  constructor(
    @Optional()
    private readonly client: OpenAiResponsesHttpClient =
      new FetchOpenAiResponsesHttpClient(),
  ) {}

  async decide(
    input: OpenAiResponsesOperatorRuntimeInput,
  ): Promise<OpenAiResponsesOperatorRuntimeResult> {
    const startedAt = Date.now();
    const apiKey = stringField(input.apiKey ?? process.env.OPENAI_API_KEY);
    if (!apiKey) {
      throw new AgentOsRuntimeError(
        'operator_runtime_unavailable',
        'OpenAI API key is not available.',
      );
    }

    const model = stringField(input.model);
    if (!model) {
      throw new AgentOsRuntimeError(
        'operator_runtime_model_required',
        'OpenAI Responses Operator runtime requires an explicit model.',
      );
    }

    let response: OpenAiResponsesHttpResult;
    try {
      response = await this.client.create({
        url: buildResponsesUrl(input.baseUrl ?? DEFAULT_BASE_URL),
        apiKey,
        timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        body: {
          model,
          input: [{ role: 'user', content: input.prompt }],
          store: false,
          text: {
            format: {
              type: 'json_schema',
              name: 'operator_decision',
              schema: readOutputSchema(input),
              strict: true,
            },
          },
        },
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new AgentOsRuntimeError(
          'operator_runtime_timeout',
          'OpenAI Responses Operator runtime timed out.',
        );
      }
      throw error;
    }

    if (!response.ok) {
      throw new AgentOsRuntimeError(
        'operator_runtime_failed',
        compactRuntimeError(
          `OpenAI Responses API request failed with status ${response.status}: ${errorMessageFromBody(response.body)}`,
        ),
      );
    }

    const status = responseStatus(response.body);
    if (status && status !== 'completed') {
      throw new AgentOsRuntimeError(
        'operator_runtime_incomplete',
        `OpenAI Responses API returned status ${status}.`,
      );
    }

    if (hasModelRefusal(response.body)) {
      throw new AgentOsRuntimeError(
        'operator_runtime_refused',
        'OpenAI Responses model refused the Operator decision request.',
      );
    }

    const rawOutput = extractOutputText(response.body);
    if (!rawOutput) {
      throw new AgentOsRuntimeError(
        'operator_runtime_empty',
        'OpenAI Responses Operator runtime returned no output text.',
      );
    }

    const body = asRecord(response.body);

    return {
      provider: 'openai_responses',
      rawOutput,
      responseId: stringField(body?.id),
      model: stringField(body?.model) ?? model,
      durationMs: Date.now() - startedAt,
      inputTokens: usageNumber(response.body, 'input_tokens'),
      outputTokens: usageNumber(response.body, 'output_tokens'),
      cachedInputTokens: cachedInputTokens(response.body),
    };
  }
}
