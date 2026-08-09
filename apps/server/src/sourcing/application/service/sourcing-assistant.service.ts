import { Inject, Injectable } from '@nestjs/common';
import { kstBusinessDate } from '../../../common/kst';
import {
  SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT,
  type SourcingWorkspaceSnapshotRepositoryPort,
} from '../port/out/repository/sourcing-workspace-snapshot.repository.port';
import {
  retrieveDocuments,
  type AssistantDocument,
  type RetrievedDocument,
} from '../../domain/sourcing-assistant-retrieval';

const RAG_LOOKBACK_DAYS = 90;
const RETRIEVAL_LIMIT = 6;

export interface AskSourcingAssistantInput {
  organizationId: string;
  question: string;
  /** 기존 화면 wire 호환용; retrieval-only 경로에서는 서버 근거만 검색한다. */
  visibleContext?: string;
}

export type SourcingAssistantAnswerMode =
  /** 서버가 검증 가능한 내부 근거 검색 결과만 돌려줌. */
  'retrieval_only';

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
  model: string | null;
  /** 생성 runtime을 의도적으로 쓰지 않는 사유. 화면이 그대로 보여준다. */
  degradedReason: string | null;
  degradedCode: 'generation_disabled';
}

/**
 * 자사 소싱 데이터에 근거한 어시스턴트.
 *
 * 외부 수집 텍스트는 프롬프트 인젝션 경계다. 안전한 생성 runtime이 별도 설계·검토될
 * 때까지 서버 프로세스를 생성하지 않고, 조직 스냅샷에서 검색한 근거만 돌려준다.
 */
@Injectable()
export class SourcingAssistantService {
  constructor(
    @Inject(SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT)
    private readonly snapshots: SourcingWorkspaceSnapshotRepositoryPort,
  ) {}

  async ask(input: AskSourcingAssistantInput): Promise<SourcingAssistantAnswer> {
    const documents = await this.loadDocuments(input.organizationId);
    const retrieved = retrieveDocuments({
      documents,
      query: input.question,
      limit: RETRIEVAL_LIMIT,
    });

    const citations = retrieved.map((doc, index) => ({
      index: index + 1,
      title: doc.title,
      sourceScope: doc.sourceScope,
      sourceDate: doc.sourceDate,
      matchedTerms: doc.matchedTerms,
    }));

    return {
      mode: 'retrieval_only',
      text: buildRetrievalOnlyText(retrieved),
      citations,
      documentCount: documents.length,
      model: null,
      degradedReason: '안전한 생성 runtime이 구성되지 않아 내부 근거 검색 결과만 표시합니다.',
      degradedCode: 'generation_disabled',
    };
  }

  /** RAG 코퍼스는 `sourcing_agent_rag` 스냅샷에 통째로 들어 있다. 최신 것 하나만 읽는다. */
  private async loadDocuments(organizationId: string): Promise<AssistantDocument[]> {
    // 스냅샷 businessDate 는 KST 영업일이다. raw `new Date()` 를 쓰면 00:00~09:00 KST 에
    // 오늘자 코퍼스가 조회에서 빠진다.
    const today = kstBusinessDate(new Date());
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - RAG_LOOKBACK_DAYS);

    const rows = await this.snapshots.listRecent({
      organizationId,
      scope: 'sourcing_agent_rag',
      fromBusinessDate: from,
      toBusinessDate: today,
      limit: RAG_LOOKBACK_DAYS,
    });

    if (rows.length === 0) {
      return [];
    }

    const latest = rows.reduce((best, row) =>
      row.businessDate.getTime() > best.businessDate.getTime() ? row : best,
    );

    const result = (latest.payload as Record<string, unknown> | undefined)?.result;
    const rawDocuments = isRecord(result) ? result.documents : undefined;
    if (!Array.isArray(rawDocuments)) return [];

    return rawDocuments.filter(isRecord).map(toAssistantDocument);
  }
}

function toAssistantDocument(raw: Record<string, unknown>): AssistantDocument {
  return {
    id: asString(raw.id) ?? '',
    kind: asString(raw.kind) ?? 'unknown',
    title: asString(raw.title) ?? '',
    text: asString(raw.text) ?? '',
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    sourceScope: asString(raw.sourceScope) ?? 'unknown',
    sourceDate: asString(raw.sourceDate),
    metadata: isRecord(raw.metadata) ? raw.metadata : {},
  };
}

/** 답을 지어내지 않고 검색된 근거만 나열한다. */
function buildRetrievalOnlyText(retrieved: RetrievedDocument[]): string {
  if (retrieved.length === 0) {
    return '내부 데이터에서 관련 근거를 찾지 못했습니다.';
  }

  const lines = retrieved.map((doc, index) => `[${index + 1}] ${doc.title} — ${doc.text}`);
  return ['관련 내부 근거를 찾았습니다. (요약 생성은 아래 사유로 건너뛰었습니다)', '', ...lines].join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
