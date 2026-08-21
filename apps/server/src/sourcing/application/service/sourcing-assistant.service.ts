import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AGENT_INTERACTION_PORT,
  type AgentInteractionPort,
  type AgentInteractionResult,
} from '../../../agent-os/application/port/in/legacy-run/agent-interaction.port';
import { SourcingAgentRagService } from './sourcing-agent-rag.service';
import type { SourcingWorkspaceEvidenceResult } from '../port/in/capability/sourcing-agent-workspace-capability.port';

const RAG_LOOKBACK_DAYS = 30;
const RETRIEVAL_LIMIT = 6;

export interface AskSourcingAssistantInput {
  organizationId: string;
  userId: string;
  question: string;
  conversationId?: string | null;
  /** 기존 화면 wire 호환용. 내용은 Agent OS payload나 프롬프트로 전달하지 않는다. */
  visibleContext?: string;
}

export type SourcingAssistantRuntime = 'claude' | 'codex';
export type SourcingAssistantAnswerMode = 'generated' | 'retrieval_only';
export type SourcingAssistantDegradedCode =
  | 'cli_not_found'
  | 'unauthenticated'
  | 'timeout'
  | 'output_limit'
  | 'busy'
  | 'execution_failed'
  | 'generation_disabled'
  | 'model_not_configured'
  | 'runtime_not_configured';

export interface SourcingAssistantCitation {
  index: number;
  title: string;
  sourceScope: string;
  sourceDate: string | null;
  matchedTerms: string[];
}

export interface SourcingAssistantAnswer {
  mode: SourcingAssistantAnswerMode;
  text: string;
  citations: SourcingAssistantCitation[];
  documentCount: number;
  runtime: SourcingAssistantRuntime | null;
  model: string | null;
  degradedReason: string | null;
  degradedCode: SourcingAssistantDegradedCode | null;
  conversationId: string | null;
}

@Injectable()
export class SourcingAssistantService {
  private readonly logger = new Logger(SourcingAssistantService.name);

  constructor(
    @Inject(AGENT_INTERACTION_PORT)
    private readonly interaction: AgentInteractionPort,
    private readonly rag: SourcingAgentRagService,
  ) {}

  async ask(
    input: AskSourcingAssistantInput,
  ): Promise<SourcingAssistantAnswer> {
    const question = input.question.trim();
    let result: AgentInteractionResult;
    try {
      result = await this.interaction.interact({
        organizationId: input.organizationId,
        userId: input.userId,
        agentType: 'sourcing',
        surface: 'sourcing_dashboard',
        conversationId: input.conversationId ?? null,
        content: question,
        sourceResourceType: 'sourcing_workspace',
        sourceResourceId: 'entry',
        payload: {
          visibleContextProvided: Boolean(input.visibleContext?.trim()),
        },
        executionMode: 'inline',
        maxAttempts: 1,
      });
    } catch (error: unknown) {
      const degradedCode = publicDegradedCode(errorCodeOf(error));
      this.logger.warn(
        `Sourcing Agent OS interaction unavailable (${degradedCode}).`,
      );
      return this.retrievalOnly({
        input,
        question,
        runtime: null,
        model: null,
        degradedCode,
        conversationId: null,
      });
    }

    const runtime = publicRuntime(result.provider);
    const generated =
      result.status === 'succeeded' ? generatedOutput(result.output) : null;
    if (generated && runtime && result.model) {
      return {
        mode: 'generated',
        text: generated.text,
        citations: generated.citations,
        documentCount: generated.documentCount,
        runtime,
        model: result.model,
        degradedReason: noEvidenceReason(
          generated.documentCount,
          generated.citations.length,
          generated.hasVerifiedResource,
        ),
        degradedCode: null,
        conversationId: result.conversationId,
      };
    }

    const degradedCode =
      result.status === 'succeeded'
        ? result.model
          ? 'execution_failed'
          : 'model_not_configured'
        : publicDegradedCode(result.errorCode);
    this.logger.warn(
      `Sourcing Agent OS generation unavailable (${degradedCode}).`,
    );
    const answer = await this.retrievalOnly({
      input,
      question,
      runtime,
      model: result.model,
      degradedCode,
      conversationId: result.conversationId,
    });
    await this.interaction.recordAssistantMessage({
      organizationId: input.organizationId,
      conversationId: result.conversationId,
      requestId: result.requestId,
      runId: result.runId,
      content: answer.text,
      metadata: {
        surface: 'sourcing_dashboard',
        fallback: true,
        degradedCode,
      },
    });
    return answer;
  }

  private async retrievalOnly(input: {
    input: AskSourcingAssistantInput;
    question: string;
    runtime: SourcingAssistantRuntime | null;
    model: string | null;
    degradedCode: SourcingAssistantDegradedCode;
    conversationId: string | null;
  }): Promise<SourcingAssistantAnswer> {
    const evidence = await this.rag.retrieveWorkspaceEvidence({
      organizationId: input.input.organizationId,
      query: input.question,
      topK: RETRIEVAL_LIMIT,
      days: RAG_LOOKBACK_DAYS,
    });
    return {
      mode: 'retrieval_only',
      text: buildRetrievalOnlyText(evidence),
      citations: evidence.documents.map((document, index) => ({
        index: index + 1,
        title: document.title,
        sourceScope: document.sourceScope,
        sourceDate: document.sourceDate,
        matchedTerms: document.matchedTerms,
      })),
      documentCount: evidence.documentCount,
      runtime: input.runtime,
      model: input.model,
      degradedReason: describeFailure(input.runtime, input.degradedCode),
      degradedCode: input.degradedCode,
      conversationId: input.conversationId,
    };
  }
}

interface VerifiedGeneratedOutput {
  text: string;
  citations: SourcingAssistantCitation[];
  documentCount: number;
  hasVerifiedResource: boolean;
}

function generatedOutput(
  value: Record<string, unknown> | null,
): VerifiedGeneratedOutput | null {
  if (!value || value.schemaVersion !== 'sourcing-agent-answer.v1') return null;
  const text = typeof value.text === 'string' ? value.text.trim() : '';
  if (!text || !Array.isArray(value.citations)) return null;
  const documentCount = finiteNonNegativeNumber(value.documentCount);
  if (documentCount === null) return null;
  const citations: SourcingAssistantCitation[] = [];
  for (const [index, valueCitation] of value.citations.entries()) {
    const citation = recordValue(valueCitation);
    const summary = recordValue(citation?.summary);
    const title = stringValue(citation?.title);
    if (!citation || !summary || !title) return null;
    citations.push({
      index: index + 1,
      title,
      sourceScope: stringValue(summary.sourceScope) ?? 'sourcing_evidence',
      sourceDate: stringValue(summary.sourceDate),
      matchedTerms: stringArray(summary.matchedTerms),
    });
  }
  return {
    text,
    citations,
    documentCount,
    hasVerifiedResource:
      (Array.isArray(value.resourceRefs) && value.resourceRefs.length > 0) ||
      stringValue(value.operationRunId) !== null,
  };
}

function buildRetrievalOnlyText(
  evidence: SourcingWorkspaceEvidenceResult,
): string {
  if (evidence.documents.length === 0) {
    return '내부 데이터에서 관련 근거를 찾지 못했습니다.';
  }
  const lines = evidence.documents.map(
    (document, index) => `[${index + 1}] ${document.title} — ${document.text}`,
  );
  return [
    '관련 내부 근거를 찾았습니다. (요약 생성은 아래 사유로 건너뛰었습니다)',
    '',
    ...lines,
  ].join('\n');
}

function publicRuntime(
  provider: AgentInteractionResult['provider'],
): SourcingAssistantRuntime | null {
  if (provider === 'codex_cli') return 'codex';
  if (provider === 'claude_cli') return 'claude';
  return null;
}

function publicDegradedCode(
  errorCode: string | null,
): SourcingAssistantDegradedCode {
  switch (errorCode) {
    case 'model_required':
      return 'model_not_configured';
    case 'runtime_not_configured':
      return 'runtime_not_configured';
    case 'cli_not_found':
      return 'cli_not_found';
    case 'unauthenticated':
      return 'unauthenticated';
    case 'timeout':
      return 'timeout';
    case 'output_limit':
      return 'output_limit';
    case 'busy':
      return 'busy';
    default:
      return 'execution_failed';
  }
}

function describeFailure(
  runtime: SourcingAssistantRuntime | null,
  code: SourcingAssistantDegradedCode,
): string {
  const label =
    runtime === 'codex'
      ? 'Codex CLI'
      : runtime === 'claude'
        ? 'Claude CLI'
        : 'Agent OS';
  switch (code) {
    case 'generation_disabled':
      return '생성 runtime이 설정되지 않아 내부 근거 검색 결과만 표시합니다.';
    case 'model_not_configured':
      return 'AGENT_SOURCING_MODEL이 없어 모델을 고르지 못했습니다. 내부 근거만 표시합니다.';
    case 'runtime_not_configured':
      return '소싱 에이전트 runtime 설정을 확인하세요. 내부 근거만 표시합니다.';
    case 'cli_not_found':
      return `${label} 실행 파일을 찾지 못했습니다. 서버 runtime에 CLI를 설치하세요.`;
    case 'unauthenticated':
      return `${label} 인증을 확인하세요.`;
    case 'timeout':
      return `${label} 응답이 시간 내에 오지 않았습니다.`;
    case 'output_limit':
      return `${label} 응답이 허용된 길이를 초과했습니다.`;
    case 'busy':
      return '다른 답변 생성이 끝날 때까지 내부 근거만 표시합니다.';
    default:
      return `${label} 실행에 실패했습니다. 서버 로그에서 상세 사유를 확인하세요.`;
  }
}

function noEvidenceReason(
  documentCount: number,
  citationCount: number,
  hasVerifiedResource: boolean,
): string | null {
  if (citationCount > 0 || hasVerifiedResource) return null;
  return documentCount === 0
    ? '내부 근거 문서가 하나도 없습니다. 아래 답변은 근거 없이 생성됐습니다.'
    : '질문과 일치하는 내부 근거를 찾지 못했습니다. 아래 답변은 근거 없이 생성됐습니다.';
}

function errorCodeOf(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  return stringValue((error as Record<string, unknown>).code);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function finiteNonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
