import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../../app.module';
import { AgentConversationService } from '../../../application/service/agent-conversation.service';
import { AgentRunExecutor } from '../../../application/service/agent-run-executor.service';
import { AgentRunGraphService } from '../../../application/service/agent-run-graph.service';
import type { AgentRunnerExecuteRequestResult } from '../../../application/port/in/agent-runner.port';

export const HERMES_TOOL_LOOP_E2E_URL =
  'https://detail.1688.com/offer/767987154308.html?topicCode=202603180010000000000015218891&optName=%E7%83%AD%E7%82%B9%E5%95%86%E6%9C%BA&topicName=%E8%B6%8A%E9%87%8E%E8%BD%A6%E7%8E%A9%E5%85%B7&item_id=767987154308&offerId=767987154308&object_id=767987154308&spm=a260k.29939364.recommend.6';

const DEFAULT_WORKER_ID = 'hermes-tool-loop-e2e';
const MISSING_E2E_ENV_MESSAGE =
  'Set AGENT_OS_E2E_ORGANIZATION_ID and AGENT_OS_E2E_USER_ID before running Hermes e2e.';

export interface HermesToolLoopE2eEnv {
  organizationId: string;
  userId: string;
}

export interface RunHermesToolLoopE2eInput extends HermesToolLoopE2eEnv {
  url?: string;
  workerId?: string;
}

export interface HermesToolLoopE2eArtifactSummary {
  sourcingCandidateArtifactId: string;
  listingPrepPackageArtifactId: string;
  detailDraftRef: string;
  thumbnailDraftRef: string;
}

function envString(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  key: string,
): string | null {
  const value = env[key];
  return value && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function artifactSummary(artifact: unknown): Record<string, unknown> {
  if (!isRecord(artifact)) return {};
  return isRecord(artifact.summary) ? artifact.summary : {};
}

function artifactType(artifact: unknown): string | null {
  return isRecord(artifact) ? stringField(artifact.artifactType) : null;
}

function artifactId(artifact: unknown): string | null {
  return isRecord(artifact) ? stringField(artifact.id) : null;
}

function draftRef(
  summary: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const direct = stringField(summary[key]);
    if (direct) return direct;
  }
  return null;
}

export function buildHermesToolLoopE2eMessage(
  url = HERMES_TOOL_LOOP_E2E_URL,
): string {
  return [
    'Hermes tool-loop live e2e:',
    '이 1688 상품을 쿠팡 등록 전 상태까지 준비해줘.',
    'Hermes Operator가 필요한 Agent를 직접 판단하고,',
    '상세페이지 draft reference와 썸네일 draft reference가 포함된 listing prep package까지 만들어줘.',
    '쿠팡 제출, 마켓 등록, 공급사 주문 제출은 하지 마.',
    `URL: ${url}`,
  ].join(' ');
}

export function parseHermesToolLoopE2eEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): HermesToolLoopE2eEnv {
  const organizationId = envString(env, 'AGENT_OS_E2E_ORGANIZATION_ID');
  const userId = envString(env, 'AGENT_OS_E2E_USER_ID');
  if (!organizationId || !userId) {
    throw new Error(MISSING_E2E_ENV_MESSAGE);
  }
  return { organizationId, userId };
}

export function validateHermesToolLoopE2eRuntimeEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): void {
  if (!envString(env, 'AGENT_OS_HERMES_MODEL')) {
    throw new Error('AGENT_OS_HERMES_MODEL is required for Hermes tool-loop e2e.');
  }
}

export function loadHermesToolLoopE2eEnv(cwd = process.cwd()): void {
  config({ path: resolve(cwd, 'apps/server/.env') });
  config({ path: resolve(cwd, '.env') });
}

export function assertHermesToolLoopE2eResult(
  result: AgentRunnerExecuteRequestResult,
): void {
  if (!result.executed) {
    throw new Error(
      `Hermes tool-loop e2e did not execute the Operator request: ${result.reason ?? 'unknown'}`,
    );
  }
  if (result.errorCode) {
    throw new Error(
      `Hermes tool-loop e2e failed with ${result.errorCode}.`,
    );
  }
  if (result.reason === 'requires_approval') {
    throw new Error('Hermes tool-loop e2e paused for approval.');
  }
}

export function assertHermesToolLoopE2eArtifacts(
  graph: unknown,
): HermesToolLoopE2eArtifactSummary {
  const artifacts = isRecord(graph) && Array.isArray(graph.artifacts)
    ? graph.artifacts
    : [];
  const sourcingCandidate = artifacts.find(
    (artifact) => artifactType(artifact) === 'sourcing_candidate',
  );
  if (!sourcingCandidate) {
    throw new Error(
      'Hermes tool-loop e2e did not create a sourcing candidate artifact.',
    );
  }

  const listingPrepPackage = artifacts.find(
    (artifact) => artifactType(artifact) === 'listing_prep_package',
  );
  if (!listingPrepPackage) {
    throw new Error(
      'Hermes tool-loop e2e did not create a listing prep package artifact.',
    );
  }

  const summary = artifactSummary(listingPrepPackage);
  const detailDraftRef = draftRef(summary, [
    'detailGenerationId',
    'detailPageDraftRef',
    'detailDraftRef',
  ]);
  if (!detailDraftRef) {
    throw new Error(
      'Hermes tool-loop e2e listing prep package is missing detail draft reference.',
    );
  }

  const thumbnailDraftRef = draftRef(summary, [
    'thumbnailGenerationId',
    'thumbnailDraftRef',
    'thumbnailUrl',
  ]);
  if (!thumbnailDraftRef) {
    throw new Error(
      'Hermes tool-loop e2e listing prep package is missing thumbnail draft reference.',
    );
  }

  return {
    sourcingCandidateArtifactId: artifactId(sourcingCandidate) ?? 'unknown',
    listingPrepPackageArtifactId: artifactId(listingPrepPackage) ?? 'unknown',
    detailDraftRef,
    thumbnailDraftRef,
  };
}

export async function runHermesToolLoopE2e(input: RunHermesToolLoopE2eInput) {
  validateHermesToolLoopE2eRuntimeEnv();
  process.env.AGENT_OS_OPERATOR_RUNTIME = 'hermes_tool_loop';
  process.env.AGENT_OS_HERMES_LEAF_AGENT_TYPES =
    process.env.AGENT_OS_HERMES_LEAF_AGENT_TYPES?.trim() || 'sourcing,listing';

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const conversations = app.get(AgentConversationService);
    const executor = app.get(AgentRunExecutor);
    const graphService = app.get(AgentRunGraphService);
    const started = await conversations.startConversation({
      organizationId: input.organizationId,
      userId: input.userId,
      content: buildHermesToolLoopE2eMessage(input.url),
    });
    if (!started.rootRequestId) {
      throw new Error('Hermes tool-loop e2e conversation has no Operator root request.');
    }

    const result = await executor.executeRequest(
      input.workerId ?? DEFAULT_WORKER_ID,
      input.organizationId,
      started.rootRequestId,
    );
    assertHermesToolLoopE2eResult(result);
    const graph = await graphService.getConversationGraph({
      organizationId: input.organizationId,
      conversationId: started.conversation.id,
    });
    const artifactSummary = assertHermesToolLoopE2eArtifacts(graph);
    return {
      conversationId: started.conversation.id,
      rootRequestId: started.rootRequestId,
      result,
      artifactSummary,
      inspectPath: `/agent-os?conversationId=${started.conversation.id}`,
    };
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  loadHermesToolLoopE2eEnv();
  try {
    const env = parseHermesToolLoopE2eEnv();
    runHermesToolLoopE2e(env)
      .then((result) => {
        console.log(JSON.stringify(result, null, 2));
      })
      .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
