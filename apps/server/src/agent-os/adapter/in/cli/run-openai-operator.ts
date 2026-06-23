import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../../app.module';
import { AgentRunCoordinator } from '../../../application/service/agent-run-coordinator.service';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
} from '../../../application/port/out/repository/agent-os-repository.port';
import type { AgentRunnerExecuteRequestResult } from '../../../application/port/in/agent-runner.port';

export interface RunOpenAiOperatorArgs {
  organizationId: string;
  conversationId: string;
  requestId: string;
  workerId: string;
}

export interface FormatRunOpenAiOperatorResultInput {
  conversationId: string;
  model: string;
  result: AgentRunnerExecuteRequestResult;
}

const DEFAULT_WORKER_ID = 'agent-os-openai-cli';

function readFlag(argv: string[], name: string): string | null {
  const prefix = `${name}=`;
  const inline = argv.find((item) => item.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim() || null;

  const index = argv.indexOf(name);
  if (index < 0) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) return null;
  return value.trim() || null;
}

function requiredFlag(argv: string[], name: string): string {
  const value = readFlag(argv, name);
  if (!value) {
    throw new Error(`Missing required flag: ${name}`);
  }
  return value;
}

function envString(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  key: string,
): string | null {
  const value = env[key];
  return value && value.trim() ? value.trim() : null;
}

export function parseRunOpenAiOperatorArgs(
  argv: string[],
): RunOpenAiOperatorArgs {
  return {
    organizationId: requiredFlag(argv, '--organization-id'),
    conversationId: requiredFlag(argv, '--conversation-id'),
    requestId: requiredFlag(argv, '--request-id'),
    workerId: readFlag(argv, '--worker-id') ?? DEFAULT_WORKER_ID,
  };
}

export function validateRunOpenAiOperatorEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): void {
  if (!envString(env, 'OPENAI_API_KEY')) {
    throw new Error('OPENAI_API_KEY is required for the OpenAI Operator harness.');
  }
  if (!envString(env, 'AGENT_OS_OPENAI_RESPONSES_MODEL')) {
    throw new Error(
      'AGENT_OS_OPENAI_RESPONSES_MODEL is required for the OpenAI Operator harness.',
    );
  }
}

export function formatRunOpenAiOperatorResult(
  input: FormatRunOpenAiOperatorResultInput,
): string {
  return JSON.stringify(
    {
      runtime: 'openai_responses',
      model: input.model,
      executed: input.result.executed,
      requestId: input.result.requestId ?? null,
      runId: input.result.runId ?? null,
      reason: input.result.reason ?? null,
      errorCode: input.result.errorCode ?? null,
      inspectPath: `/agent-os?conversationId=${input.conversationId}`,
    },
    null,
    2,
  );
}

export function loadRunOpenAiOperatorEnv(cwd = process.cwd()): void {
  config({ path: resolve(cwd, 'apps/server/.env') });
  config({ path: resolve(cwd, '.env') });
}

async function assertRequestMatchesConversation(input: {
  repository: AgentOsRepositoryPort;
  organizationId: string;
  conversationId: string;
  requestId: string;
}): Promise<void> {
  const request = await input.repository.findRunRequestById({
    organizationId: input.organizationId,
    requestId: input.requestId,
  });
  if (!request || request.conversationId !== input.conversationId) {
    throw new Error('Agent OS request not found for the given conversation.');
  }
  if (request.agentType !== 'manager') {
    throw new Error('OpenAI Operator harness can only run manager requests.');
  }
}

export async function runOpenAiOperatorCli(
  argv = process.argv.slice(2),
): Promise<AgentRunnerExecuteRequestResult> {
  loadRunOpenAiOperatorEnv();
  process.env.AGENT_OS_OPERATOR_RUNTIME = 'openai_responses';
  validateRunOpenAiOperatorEnv();

  const args = parseRunOpenAiOperatorArgs(argv);
  const model = envString(process.env, 'AGENT_OS_OPENAI_RESPONSES_MODEL')!;
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const repository = app.get<AgentOsRepositoryPort>(AGENT_OS_REPOSITORY_PORT);
    await assertRequestMatchesConversation({
      repository,
      organizationId: args.organizationId,
      conversationId: args.conversationId,
      requestId: args.requestId,
    });

    const runner = app.get(AgentRunCoordinator);
    const result = await runner.executeRequest({
      organizationId: args.organizationId,
      requestId: args.requestId,
      workerId: args.workerId,
    });
    console.log(
      formatRunOpenAiOperatorResult({
        conversationId: args.conversationId,
        model,
        result,
      }),
    );
    if (!result.executed) {
      process.exitCode = 1;
    }
    return result;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  runOpenAiOperatorCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
